import { CookieJar, type StoredCookie } from "./jar";

/**
 * WA Department of Education "Connect", the student portal with assessment outlines and grades. WA public schools
 * only, and it signs in with the same DET login as Compass.
 *
 * Sign-in without a browser: /login/student redirects to the DET single sign-on (Oracle Access Manager) form on
 * login.det.wa.edu.au; posting it with the username, password and "acceptterms" redirects back to Connect with the
 * session cookies. Every data call is then POST /connectapi/rest/api/v1/... with X-XSRF-TOKEN set to the CONNECT_XSRF
 * cookie. Endpoint shapes come from the connect-sdk research, which captured the portal's own calls.
 *
 * Read-only by construction: api() refuses any path that is not on the allow-list or that names a write.
 */

export const CONNECT_ORIGIN = "https://connect.det.wa.edu.au";
const API = "/connectapi/rest/api/v1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class ConnectError extends Error {
  constructor(
    message: string,
    readonly code: "bad-credentials" | "mfa" | "expired" | "upstream" | "read-only",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ConnectError";
  }
}

// ---------- read-only guard (from the connect-sdk) ----------

const ALLOW = [
  /^\/basic\/whoami/,
  /^\/app\/my_classes\//,
  /^\/app\/student\/assessmentOutlines(\/chart)?\?studentId=\d+$/,
  /^\/common\/schoolclasses\/\d+\/(teachers|staff)/,
  /^\/notices\/scope\/DomainSchoolClass\/\d+\/\?/,
  /^\/submission\/scope\/\d+\?/,
  /^\/marksbook\/class\/\d+\/(outline\/summary|outline\/\d+\/tasks)$/,
  /^\/app\/calendar\/class\/\d+\/events\?/,
  // Learning content (a class's folders, files and links), submissions, classmates and attendance (more.ts).
  /^\/learningcontent\/root\/DomainSchoolClass\/\d+\/$/,
  /^\/learningcontent\/(root|section)\/\d+\/contents\?/,
  /^\/submission\/class\/\d+\/studentSubmission\/\d+\?/,
  /^\/common\/schoolclasses\/\d+\/students\?/,
  /^\/app\/student\/attendance_(summary|details)\?studentId=\d+$/,
];
const DENY = /(create|update|delete|add|publish|remove|move|reorder|repost|submit|upload|markread|setread|recordView|\/read\b|comment\/|\/respond)/i;

function assertReadOnly(path: string) {
  // The words are looked for in the path, not the query: a read's query can say view=PUBLISHED.
  if (!ALLOW.some(r => r.test(path)) || DENY.test(path.split("?")[0]!)) {
    throw new ConnectError(`Refusing a Connect call that is not read-only: ${path.slice(0, 80)}`, "read-only");
  }
}

// ---------- HTTP with the jar ----------

type Hop = { res: Response; url: string };

/** Fetches url and follows redirects by hand, so every hop's cookies land in the jar. */
async function follow(jar: CookieJar, url: string, init: RequestInit = {}, max = 12): Promise<Hop> {
  let method = init.method ?? "GET";
  let body = init.body;
  for (let i = 0; i < max; i++) {
    const res = await fetch(url, {
      ...init,
      method,
      body,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", ...(init.headers as Record<string, string>), Cookie: jar.header(url) },
      redirect: "manual",
    });
    jar.absorb(url, res.headers);
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url).toString();
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    return { res, url };
  }
  throw new ConnectError("Connect's sign-in went round in circles.", "upstream");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** The sign-on form's action and hidden fields. */
function readLoginForm(html: string, pageUrl: string) {
  const form = /<form[^>]*id="LoginForm"[^>]*>([\s\S]*?)<\/form>/i.exec(html);
  if (!form) return null;
  const action = /action="([^"]+)"/i.exec(form[0])?.[1];
  const fields: Record<string, string> = {};
  for (const m of form[1]!.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const name = /name="([^"]*)"/i.exec(m[0])?.[1];
    if (name) fields[name] = decode(/value="([^"]*)"/i.exec(m[0])?.[1] ?? "");
  }
  return { action: new URL(decode(action ?? "/oam/server/auth_cred_submit"), pageUrl).toString(), fields };
}

/**
 * Whether a failed sign-in is worth trying again: the DET single sign-on's form not loading, a redirect chain that
 * stops somewhere unexpected, Connect not starting its session, or the network dropping a request. Never a refused
 * login or a second sign-in step: those answer the same every time, and repeating a wrong password only brings the
 * DET lockout closer.
 */
export const transientConnectSignIn = (e: unknown) => (e instanceof ConnectError ? e.code === "upstream" : e instanceof Error);

/**
 * Signs in to Connect with a DET username and password. The sign-on is a chain of redirects across two hosts and
 * trips now and then; a trip is tried again (twice, waits doubling from about a second, with jitter).
 */
export async function connectSignIn(login: { username: string; password: string }): Promise<ConnectSession> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await connectSignInOnce(login);
    } catch (e) {
      if (attempt >= 3 || !transientConnectSignIn(e)) throw e;
      const wait = 900 * 2 ** (attempt - 1);
      await new Promise(resolve => setTimeout(resolve, wait / 2 + Math.random() * wait));
    }
  }
}

async function connectSignInOnce({ username, password }: { username: string; password: string }): Promise<ConnectSession> {
  const jar = new CookieJar();
  let { res, url } = await follow(jar, `${CONNECT_ORIGIN}/login/student`);
  let html = await res.text();
  const form = readLoginForm(html, url);
  if (!form) throw new ConnectError("Connect's sign-in form did not load.", "upstream", res.status);

  const body = new URLSearchParams({ ...form.fields, ssousername: username, password, acceptterms: "acceptterms", submit: "Login" });
  ({ res, url } = await follow(jar, form.action, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: new URL(form.action).origin, Referer: url },
    body: body.toString(),
  }));
  html = await res.text();
  const host = new URL(url).hostname;
  if (host !== new URL(CONNECT_ORIGIN).hostname) {
    const words = text(html);
    if (/incorrect username or password/i.test(words)) throw new ConnectError("Connect did not accept that username and password.", "bad-credentials");
    if (/verif|one-time|passcode|authenticat/i.test(words)) throw new ConnectError("Connect asked for a second sign-in step.", "mfa");
    const error = /error[^.]{0,4}[:.]?\s*([^.]{8,140}\.)/i.exec(words)?.[1];
    throw new ConnectError(error ?? "Connect's sign-in stopped on an unexpected page.", readLoginForm(html, url) ? "bad-credentials" : "upstream", res.status);
  }

  // Open the student portal so Connect starts its session and hands out the CONNECT_XSRF cookie.
  ({ url } = await follow(jar, `${CONNECT_ORIGIN}/group/students/ui/overview`));
  if (new URL(url).hostname !== new URL(CONNECT_ORIGIN).hostname) throw new ConnectError("Connect sent the sign-in back to the login page.", "upstream");

  const session = new ConnectSession(jar);
  await session.whoami();
  return session;
}

// ---------- the session ----------

export type ConnectMe = { id: number; name: string | null; school: string | null };

export type GradeTask = {
  taskId: number;
  name: string;
  description: string | null;
  mark: number | null;
  maximumMark: number | null;
  weightedMark: number | null;
  weightedMaximumMark: number | null;
  /** The part of the outline it sits in, when the outline is split into parts ("Chemical Sciences", "Term 3 - HIS"). */
  group?: string | null;
  /** How the class did on it (Connect's chart), once marked. */
  spread?: Spread | null;
};

/**
 * How a class did, as Connect's results chart draws it: the lowest mark, the quartiles, the median and the highest, all
 * out of 100. Connect gives no rank as such; this is where the student sits among their class.
 */
export type Spread = { min: number; q1: number; median: number; q3: number; max: number };

/** A class whose teacher uses Connect. Most schools put only some classes on Connect. */
export type ConnectClass = { classId: number; name: string; code: string | null; finished: boolean };

/** A notice a teacher posted to a class, as plain text. */
export type ConnectNotice = { id: number; classId: number; title: string; text: string | null; author: string | null; at: string | null };

export type SubjectGrade = {
  semester: 1 | 2;
  /**
   * The subject's name: Connect's learning area ("Mathematics"), unless the student has two outlines in one area that
   * semester ("Health and Physical Education" for both Health and General PE), when each is named for its outline
   * ("Health", "General PE"), so the two never share a name, a class or a history.
   */
  subject: string;
  /** Connect's learning area, as it names the group. */
  area?: string;
  /** Connect's ids for the group and its outline. */
  groupId?: number | null;
  outlineId?: number | null;
  outline: string | null;
  teachers: string[];
  statusLine: string | null;
  cumulativePercent: number | null;
  grade: string | null;
  tasks: GradeTask[];
  /** How the class did on the subject overall (Connect's chart). */
  spread?: Spread | null;
};

/** A number Connect sent, or null: numbers, numeric strings ("85.5", "85.5%"); never NaN. */
const num = (x: unknown): number | null => {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const n = Number.parseFloat(x.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
/** A notice's HTML as text, capped: enough to show, not a copy of the whole notice. */
const plain = (html: unknown) => {
  const t = str(html)
    ?.replace(/<br\s*\/?>|<\/p>|<li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t ? t.slice(0, 2000) : null;
};

/** A chart's box, when it has every figure. */
const spreadOf = (c: any): Spread | null => {
  if (!c) return null;
  const [min, q1, median, q3, max] = [num(c.minValue), num(c.quartile1), num(c.median), num(c.quartile3), num(c.maxValue)];
  return min != null && q1 != null && median != null && q3 != null && max != null ? { min, q1, median, q3, max } : null;
};

/**
 * A subject's score from its assessment outline, worked out from the tasks rather than taken from Connect (which
 * often has no overall mark until the semester is reported).
 *
 * percent: the weighted average of the marked tasks, each counting for its weighting (weightedMark out of
 * weightedMaximumMark). Tasks without a weighting fall back to raw marks, summed. null until something is marked.
 * markedWeight / totalWeight: how much of the subject's weighting has been marked, out of all of it (usually 100).
 */
export type Score = { percent: number | null; marked: number; total: number; markedWeight: number | null; totalWeight: number | null };

const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

type RawTaskGroup = { name?: string; tasks?: any[]; groups?: RawTaskGroup[] };

/**
 * An outline's tasks, in order, from its task groups and the parts nested in them (an outline split into "Chemical
 * Sciences", "Term 3 - HIS"...). A task with no maximum and no weighting is listed by Connect but not assessed for this
 * student (an outline shared with another course lists that course's tasks too), so it is left out.
 */
function tasksOf(groups: RawTaskGroup[], part: string | null = null): GradeTask[] {
  const out: GradeTask[] = [];
  for (const tg of groups) {
    const name = str(tg.name) ?? part;
    for (const t of tg.tasks ?? []) {
      const task: GradeTask = {
        taskId: t.taskId,
        name: str(t.taskName) ?? "Task",
        description: str(t.taskDescription),
        mark: num(t.mark),
        maximumMark: num(t.maximumMark),
        weightedMark: num(t.weightedMark),
        weightedMaximumMark: num(t.weightedMaximumMark),
        group: name,
      };
      if (task.maximumMark == null && task.weightedMaximumMark == null && task.mark == null) continue;
      out.push(task);
    }
    out.push(...tasksOf(tg.groups ?? [], name));
  }
  return out;
}

/** An outline's name as a subject: "Year 10 General PE" is "General PE", "10 Computer Programming 2026" is "Computer Programming". */
const outlineName = (outline: string) =>
  outline
    .replace(/\b(19|20)\d\d\b/g, "")
    .replace(/^\s*(year|yr)?\s*\d{1,2}\b/i, "")
    .replace(/\s+/g, " ")
    .trim() || outline;

/**
 * What a marked task counts for, in points of the subject: its mark's share of its maximum, times its weighting.
 * Connect's own weightedMark is rounded to a tenth, and summing those drifts from Connect's overall mark (50.3 for
 * 50.7); worked out from the mark it agrees.
 */
export function weightedOf(t: GradeTask): number | null {
  if (!finite(t.mark) || !finite(t.weightedMaximumMark) || t.weightedMaximumMark <= 0) return null;
  if (finite(t.maximumMark) && t.maximumMark > 0) return (t.mark / t.maximumMark) * t.weightedMaximumMark;
  return finite(t.weightedMark) ? t.weightedMark : null;
}

/** The subject's overall mark: Connect's own where it gives one (the figure teachers report), else worked out. */
export const percentOf = (g: Pick<SubjectGrade, "cumulativePercent" | "tasks">): number | null =>
  finite(g.cumulativePercent) ? g.cumulativePercent : scoreOf(g.tasks).percent;

export function scoreOf(tasks: GradeTask[]): Score {
  const marked = tasks.filter(t => finite(t.mark));
  const weighted = marked.filter(t => weightedOf(t) != null);
  const raw = marked.filter(t => finite(t.maximumMark) && t.maximumMark > 0);
  const percent = weighted.length
    ? (100 * sum(weighted.map(t => weightedOf(t)!))) / sum(weighted.map(t => t.weightedMaximumMark!))
    : raw.length
      ? (100 * sum(raw.map(t => t.mark!))) / sum(raw.map(t => t.maximumMark!))
      : null;
  const totalWeight = sum(tasks.filter(t => finite(t.weightedMaximumMark)).map(t => t.weightedMaximumMark!));
  return {
    percent: percent != null && Number.isFinite(percent) ? Math.round(percent * 10) / 10 : null,
    marked: marked.length,
    total: tasks.length,
    markedWeight: totalWeight > 0 ? sum(weighted.map(t => t.weightedMaximumMark!)) : null,
    totalWeight: totalWeight > 0 ? totalWeight : null,
  };
}

export class ConnectSession {
  readonly jar: CookieJar;
  studentId: number | null;

  constructor(jar: CookieJar | StoredCookie[], studentId: number | null = null) {
    this.jar = jar instanceof CookieJar ? jar : new CookieJar(jar);
    this.studentId = studentId;
  }

  /** A read-only, allow-listed POST to Connect's REST API. */
  async api<T = { status?: string; message?: string; items: any[] }>(path: string, body?: unknown): Promise<T> {
    assertReadOnly(path);
    const url = CONNECT_ORIGIN + API + path;
    const call = async () => {
      const xsrf = this.jar.get("CONNECT_XSRF");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          Origin: CONNECT_ORIGIN,
          Referer: `${CONNECT_ORIGIN}/group/students/ui/overview`,
          Cookie: this.jar.header(url),
          ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });
      this.jar.absorb(url, res.headers);
      return res;
    };
    let res = await call();
    // The first call can be the one that hands out CONNECT_XSRF; it is then refused for not carrying it.
    if (res.status === 403 && this.jar.get("CONNECT_XSRF")) {
      await res.body?.cancel();
      res = await call();
    }
    if ((res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403 || /text\/html/i.test(res.headers.get("content-type") ?? "")) {
      await res.body?.cancel();
      throw new ConnectError("The Connect session has ended.", "expired", res.status);
    }
    if (!res.ok) throw new ConnectError(`Connect answered ${res.status}.`, "upstream", res.status);
    const j = (await res.json()) as { status?: string; message?: string };
    if (j.status && j.status !== "SUCCESS") throw new ConnectError(j.message || `Connect said ${j.status}.`, "upstream");
    return j as T;
  }

  async whoami(): Promise<ConnectMe> {
    const w = await this.api("/basic/whoami");
    const u = w.items[0] ?? {};
    this.studentId = num(u.entityId);
    return { id: this.studentId ?? 0, name: str(u.fullName), school: str(u.extras?.schools?.[0]?.name) };
  }

  /** The student's current classes on Connect (My Classes). */
  async getClasses(): Promise<ConnectClass[]> {
    const j = await this.api("/app/my_classes/?perms=true&actions=true&sort=MOST_ACTIVE");
    return j.items
      .map((c: any) => ({ classId: num(c.entityId) ?? 0, name: str(c.name) ?? "Class", code: str(c.code), finished: !!c.finished }))
      .filter((c: ConnectClass) => c.classId > 0);
  }

  /** The latest notices on one class, newest first. Listing them does not mark them seen. */
  async getNotices(classId: number, max = 20): Promise<ConnectNotice[]> {
    const j = await this.api(`/notices/scope/DomainSchoolClass/${classId}/?start=0&range=${max}`);
    return j.items.map((n: any) => ({
      id: num(n.id) ?? 0,
      classId,
      title: str(n.title) ?? "Notice",
      text: plain(n.content),
      author: str(n.createdBy?.fullName),
      at: typeof n.createdDate === "number" ? new Date(n.createdDate).toISOString() : str(n.createdDate),
    }));
  }

  /** Every subject's marks from My Connect > Assessment Outlines: both semesters, each task, cumulative % and grade. */
  async getGrades(): Promise<SubjectGrade[]> {
    if (this.studentId == null) await this.whoami();
    const all = (await this.api(`/app/student/assessmentOutlines?studentId=${this.studentId}`)).items[0] ?? {};
    const out: SubjectGrade[] = [];
    for (const [semester, key] of [[1, "semester1Groups"], [2, "semester2Groups"]] as const) {
      for (const g of all[key] ?? []) {
        const o = (g.outlines ?? [])[0] ?? {};
        out.push({
          semester,
          subject: str(g.name) ?? "Subject",
          area: str(g.name) ?? "Subject",
          groupId: num(g.assessmentGroupId),
          outlineId: num(o.assessmentOutlineId),
          outline: str(o.description),
          teachers: (g.staff ?? []).map((s: { fullName?: string }) => s.fullName).filter(Boolean),
          statusLine: str(g.statusLine),
          cumulativePercent: num(g.groupResultsData?.mark),
          grade: str(g.groupResultsData?.grade),
          tasks: tasksOf(o.taskGroups ?? []),
        });
      }
    }
    // How the class did, subject by subject: Connect's results chart, asked for one outline at a time (as Connect's own
    // page does). A chart that fails is left out; the grades stand without it.
    for (const g of out) {
      if (g.groupId == null || g.outlineId == null) continue;
      try {
        const c = (
          await this.api(`/app/student/assessmentOutlines/chart?studentId=${this.studentId}`, {
            assessmentGroupId: g.groupId,
            assessmentOutlineId: g.outlineId,
          })
        ).items[0];
        g.spread = spreadOf(c?.groupChartData);
        for (const t of g.tasks) t.spread = spreadOf(c?.tasksChartData?.[String(t.taskId)]);
        // Connect often leaves a subject's tasks out of the chart (HASS, The Arts). With one task marked, the subject's
        // results are that task's (the same marks, the same class), so it takes them.
        const marked = g.tasks.filter(t => t.mark != null);
        if (marked.length === 1 && !marked[0]!.spread && g.spread) marked[0]!.spread = g.spread;
      } catch (e) {
        if (e instanceof ConnectError && e.code === "expired") throw e;
      }
    }

    // Two outlines in one learning area the same semester (Health and General PE are both "Health and Physical
    // Education"): each is named for its outline instead.
    for (const s of out) {
      const twin = out.some(x => x !== s && x.semester === s.semester && x.area === s.area);
      if (twin && s.outline) s.subject = outlineName(s.outline);
    }
    return out;
  }

  toJSON() {
    return { cookies: this.jar.toJSON(), studentId: this.studentId };
  }
}
