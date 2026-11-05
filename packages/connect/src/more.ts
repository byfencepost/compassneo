import { CONNECT_ORIGIN, ConnectError, type ConnectSession } from "./connect";

/**
 * Connect beyond grades and notices: a class's learning content, its submissions (and handing work in), its learners
 * and the student's attendance. Paths come from Connect's own Angular app (connect-angular-theme main.js: the
 * LearningContentRestService, SubmissionRestService, FileItemRestService and student attendance services) and were
 * checked against a real student account.
 *
 * Reads go through session.api(), behind its read-only allow-list. Handing work in is the one write, and it is kept
 * apart on purpose (handIn): two named calls, never a path from outside.
 */

const API = "/connectapi/rest/api/v1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const at = (x: unknown) => (typeof x === "number" ? new Date(x).toISOString() : str(x));

export type ConnectFile = { id: number; name: string; mime: string | null; size: number | null; path: string };

const fileOf = (f: Record<string, any> | null | undefined): ConnectFile | null => {
  const path = str(f?.trackedAttachmentUrl) ?? str(f?.untrackedAttachmentUrl);
  if (!f || !path) return null;
  return { id: num(f.id) ?? 0, name: str(f.filename) ?? "File", mime: str(f.mimeType), size: num(f.size), path };
};

// ---------------------------------------------------------------------------------------------------------------
// Learning content: the class's root folder, its sections (folders), and each section's items.

export type ContentNode = {
  id: number;
  name: string;
  kind: "folder" | "file" | "link" | "submission" | "discussion" | "other";
  file: ConnectFile | null;
  url: string | null;
  at: string | null;
  children: ContentNode[];
};

const KIND: Record<string, ContentNode["kind"]> = { FOLDER: "folder", FILEITEM: "file", LINK: "link", SUBMISSION: "submission", DISCUSSION: "discussion" };
/** Sections nest; this deep is plenty, and keeps a class's content to a handful of calls. */
const MAX_DEPTH = 3;
const MAX_CALLS = 40;

function nodeOf(n: Record<string, any>): ContentNode {
  return {
    id: num(n.id) ?? 0,
    name: str(n.name) ?? "Untitled",
    kind: KIND[n.nodeType as string] ?? "other",
    file: fileOf(n.fileItem),
    url: str(n.url),
    at: at(n.modifiedDate ?? n.createdDate),
    children: [],
  };
}

export async function getContent(c: ConnectSession, classId: number): Promise<ContentNode[]> {
  const root = (await c.api(`/learningcontent/root/DomainSchoolClass/${classId}/`)).items[0];
  if (!root?.id) return [];
  let calls = 1;
  const list = async (path: string, depth: number): Promise<ContentNode[]> => {
    if (calls++ >= MAX_CALLS) return [];
    const j = await c.api(`${path}?perms=true&start=0&view=PUBLISHED`);
    const nodes = (j.items as Array<Record<string, any>>).filter(n => !n.hidden && !n.deleted).map(nodeOf);
    for (const n of nodes) if (n.kind === "folder" && depth < MAX_DEPTH) n.children = await list(`/learningcontent/section/${n.id}/contents`, depth + 1);
    return nodes;
  };
  return list(`/learningcontent/root/${root.id}/contents`, 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Submissions: the class's submission board, and the student's own entry on one.

export type ConnectSubmissionState = { status: string; display: string } | null;

export type ConnectSubmission = {
  id: number;
  classId: number;
  name: string;
  /** The teacher's instructions, an HTML fragment. */
  description: string | null;
  createdAt: string | null;
  due: string | null;
  open: boolean;
  /** The student's own state ("NOT_SUBMITTED", "SUBMITTED_ON_TIME", "SUBMITTED_LATE", ...), as Connect words it. */
  mine: ConnectSubmissionState;
  resubmitAllowed: boolean;
  canSubmit: boolean;
};

const stateOf = (x: Record<string, any> | null | undefined): ConnectSubmissionState =>
  str(x?.status) ? { status: str(x!.status)!, display: str(x!.display) ?? str(x!.status)! } : null;

export async function getSubmissions(c: ConnectSession, classId: number): Promise<ConnectSubmission[]> {
  const j = await c.api(`/submission/scope/${classId}?start=0&range=60&sort=LATEST&perms=true&roleBasedResponseControlData=true&marks=true&tasks=true`);
  return (j.items as Array<Record<string, any>>)
    .filter(s => !s.deleted && !s.hidden && s.published !== false)
    .map(s => ({
      id: num(s.entityId) ?? 0,
      classId,
      name: str(s.name) ?? "Submission",
      description: str(s.description),
      createdAt: at(s.createDate),
      due: at(s.dueDate),
      open: (str(s.state?.status) ?? "OPEN") === "OPEN" && s.available !== false,
      mine: stateOf(s.studentSubmissionState),
      resubmitAllowed: !!s.resubmitAllowed,
      canSubmit: !!s.extras?.perms?.canUploadSubmissionForStudent || (str(s.state?.status) ?? "OPEN") === "OPEN",
    }));
}

export type MySubmission = {
  state: ConnectSubmissionState;
  files: Array<ConnectFile & { at: string | null; resubmission: boolean }>;
  feedback: { unread: boolean; hasComment: boolean } | null;
};

export async function getMySubmission(c: ConnectSession, classId: number, submissionId: number): Promise<MySubmission> {
  if (c.studentId == null) await c.whoami();
  const j = await c.api(
    `/submission/class/${classId}/studentSubmission/${submissionId}?studentId=${c.studentId}&comments=true&roleBasedResponseControlData=true&commentPerms=true`,
  );
  const s = (j.items[0] ?? {}) as Record<string, any>;
  return {
    state: stateOf(s.state),
    files: ((s.studentSubmissionItems ?? []) as Array<Record<string, any>>)
      .map(i => {
        const f = fileOf(i.fileItem);
        return f ? { ...f, name: str(i.fileName) ?? f.name, at: at(i.createDate), resubmission: !!i.resubmission } : null;
      })
      .filter((f): f is NonNullable<typeof f> => !!f),
    feedback: s.studentSubmissionFeedback ? { unread: !!s.studentSubmissionFeedback.unread, hasComment: !!s.studentSubmissionFeedback.hasComment } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Learners: everyone in the class on Connect.

export type Learner = { id: number; name: string; first: string | null; last: string | null; avatarPath: string | null; me: boolean };

export async function getLearners(c: ConnectSession, classId: number): Promise<Learner[]> {
  if (c.studentId == null) await c.whoami();
  const out: Learner[] = [];
  for (let start = 0; start < 400; start += 50) {
    const j = await c.api(`/common/schoolclasses/${classId}/students?start=${start}&range=50`);
    const items = j.items as Array<Record<string, any>>;
    for (const u of items) {
      out.push({
        id: num(u.entityId) ?? 0,
        name: str(u.fullName) ?? str(u.name) ?? "Student",
        first: str(u.firstName),
        last: str(u.lastName),
        avatarPath: str(u.avatarUrl),
        me: num(u.entityId) === c.studentId,
      });
    }
    const total = num((j as Record<string, any>).itemsTotal) ?? 0;
    if (items.length < 50 || out.length >= total) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Attendance (My Connect > Attendance): totals for the year, and the current term period by period.

export type PeriodMark = { code: string; name: string };
export type ConnectAttendance = {
  available: boolean;
  authorised: number;
  unauthorised: number;
  year: number | null;
  term: number | null;
  days: Array<{ date: string; periods: Array<PeriodMark & { period: number }> }>;
  /** Connect's own tally for the term: how many periods each mark, and its share. */
  tally: Array<PeriodMark & { periods: number; percent: number | null }>;
};

export async function getAttendance(c: ConnectSession): Promise<ConnectAttendance> {
  if (c.studentId == null) await c.whoami();
  const summary = ((await c.api(`/app/student/attendance_summary?studentId=${c.studentId}`)).items[0] ?? {}) as Record<string, any>;
  const details = ((await c.api(`/app/student/attendance_details?studentId=${c.studentId}`)).items[0] ?? {}) as Record<string, any>;
  const weeks = (details.weeks ?? []) as Array<Record<string, any>>;
  const tally = new Map<string, PeriodMark & { periods: number }>();
  for (const w of weeks) {
    for (const s of (w.summaries ?? []) as Array<Record<string, any>>) {
      const code = str(s.shortName) ?? "?";
      const t = tally.get(code) ?? { code, name: str(s.name) ?? code, periods: 0 };
      t.periods += num(s.periods) ?? 0;
      tally.set(code, t);
    }
  }
  const total = [...tally.values()].reduce((a, t) => a + t.periods, 0);
  return {
    available: summary.isAttendanceAvailable !== false,
    authorised: num(summary.totalAuthorisedAbsences) ?? 0,
    unauthorised: num(summary.totalUnauthorisedAbsences) ?? 0,
    year: num(details.year),
    term: num(details.termNumber),
    days: weeks.flatMap(w =>
      ((w.days ?? []) as Array<Record<string, any>>).map(d => ({
        date: str(d.date) ?? "",
        periods: ((d.periods ?? []) as Array<Record<string, any>>).map(p => ({
          period: num(p.periodNumber) ?? 0,
          code: str(p.status?.shortName) ?? "-",
          name: str(p.status?.name) ?? "Not recorded",
        })),
      })),
    ),
    tally: [...tally.values()].map(t => ({ ...t, percent: total ? Math.round((1000 * t.periods) / total) / 10 : null })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Files: anything Connect serves from /connectapi/files/... (content, submissions, avatars), with the session.

export async function connectFile(c: ConnectSession, path: string): Promise<{ bytes: ArrayBuffer; type: string; name: string | null } | null> {
  if (!/^\/connectapi\/files\//.test(path)) throw new ConnectError("Not a Connect file.", "read-only");
  const url = CONNECT_ORIGIN + path;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", Cookie: c.jar.header(url) }, redirect: "manual" });
  c.jar.absorb(url, res.headers);
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel();
    throw new ConnectError("The Connect session has ended.", "expired", res.status);
  }
  const type = res.headers.get("content-type") ?? "application/octet-stream";
  if (!res.ok || /text\/html/i.test(type)) {
    await res.body?.cancel();
    return null;
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
  // Connect encodes the name as a form value: spaces are pluses.
  return { bytes: await res.arrayBuffer(), type, name: name ? decodeURIComponent(name.replace(/\+/g, " ")) : null };
}

// ---------------------------------------------------------------------------------------------------------------
// Handing work in: the only writes Compass Neo makes to Connect. The student's own upload dialog does the same two
// calls: upload the file to the class (FileItemRestService.uploadFile$, purpose ATTACHMENT, context SUBMISSION), then
// attach it to their submission (SubmissionRestService.saveStudentSubmission$).

async function write(c: ConnectSession, path: string, body?: FormData) {
  const url = CONNECT_ORIGIN + API + path;
  const call = async () => {
    const xsrf = c.jar.get("CONNECT_XSRF");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        Origin: CONNECT_ORIGIN,
        Referer: `${CONNECT_ORIGIN}/group/students/ui/overview`,
        Cookie: c.jar.header(url),
        ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
      },
      body,
      redirect: "manual",
    });
    c.jar.absorb(url, res.headers);
    return res;
  };
  let res = await call();
  if (res.status === 403 && c.jar.get("CONNECT_XSRF")) {
    await res.body?.cancel();
    res = await call();
  }
  if ((res.status >= 300 && res.status < 400) || res.status === 401 || /text\/html/i.test(res.headers.get("content-type") ?? "")) {
    await res.body?.cancel();
    throw new ConnectError("The Connect session has ended.", "expired", res.status);
  }
  const j = (await res.json().catch(() => ({}))) as { status?: string; message?: string; items?: any[] };
  if (!res.ok || (j.status && j.status !== "SUCCESS")) {
    throw new ConnectError((j.message ?? `Connect answered ${res.status}.`).replace(/<br\/?>[\s\S]*$/, ""), "upstream", res.status);
  }
  return j;
}

/** Uploads a file to the class and hands it in on the submission. Returns the new file's id on Connect. */
export async function handIn(c: ConnectSession, { classId, submissionId, file, name }: { classId: number; submissionId: number; file: Blob; name: string }) {
  if (c.studentId == null) await c.whoami();
  const form = new FormData();
  form.append("file", file, name);
  const up = await write(c, `/files/upload/DomainSchoolClass/${classId}?uploadType=FILE&purpose=ATTACHMENT&context=SUBMISSION`, form);
  const fileId = num(up.items?.[0]?.id);
  if (!fileId) throw new ConnectError("Connect did not take the file.", "upstream");
  await write(c, `/submission/${submissionId}/saveStudentSubmission?studentId=${c.studentId}&attachmentId=${fileId}`);
  return fileId;
}
