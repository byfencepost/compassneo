import { USER_AGENT, normalizeSlug, schoolOrigin } from "./school";

/**
 * Signing in without a browser. The web login page waits on a Cloudflare Turnstile check, which is why the
 * compass-education package drives Chromium. The endpoint Compass's own phone apps use takes a username and password
 * as JSON and answers with the same session cookies, so a plain fetch is enough.
 */

export type Cookies = Record<string, string>;

export class CompassError extends Error {
  constructor(
    message: string,
    readonly code: "bad-credentials" | "two-factor" | "blocked" | "expired" | "unknown-school" | "upstream",
    readonly status?: number,
  ) {
    super(message);
    this.name = "CompassError";
  }
}

/** Set-Cookie lines as name/value pairs. Attributes (path, expiry) are dropped; the session lives server-side. */
export function readSetCookies(headers: Headers): Cookies {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const lines = typeof h.getSetCookie === "function" ? h.getSetCookie() : splitCombined(headers.get("set-cookie"));
  const out: Cookies = {};
  for (const line of lines) {
    const pair = line.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

// A combined Set-Cookie header joins cookies with commas, but Expires dates hold commas too.
function splitCombined(v: string | null): string[] {
  return v ? v.split(/,(?=\s*[^;,\s]+=)/) : [];
}

export function cookieHeader(cookies: Cookies): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

type AuthBody = {
  d?: {
    success?: boolean;
    friendlyMessage?: string | null;
    technicalMessage?: string | null;
    "2FAuthRequired"?: boolean;
    roles?: unknown;
  };
};

/** Signs in and returns a session, or throws a CompassError that says why not. */
export async function signIn({
  slug: slugInput,
  username,
  password,
}: {
  slug: string;
  username: string;
  password: string;
}): Promise<CompassSession> {
  const slug = normalizeSlug(slugInput);
  if (!slug) throw new CompassError("That is not a Compass school address.", "unknown-school");
  const res = await fetch(`${schoolOrigin(slug)}/services/admin.svc/AuthenticateUserCredentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ username, password, sessionstate: "readonly" }),
    redirect: "manual",
  });
  if (res.status === 403 && res.headers.get("cf-mitigated")) {
    throw new CompassError("Compass's firewall turned the sign-in away.", "blocked", 403);
  }
  if (res.status >= 300 && res.status < 400) throw new CompassError("No Compass school answers at that address.", "unknown-school", res.status);
  if (!res.ok) throw new CompassError(`Compass answered ${res.status}.`, "upstream", res.status);
  const body = (await res.json().catch(() => ({}))) as AuthBody;
  const d = body.d ?? {};
  if (d["2FAuthRequired"]) throw new CompassError("This account uses two-step sign-in.", "two-factor");
  if (!d.success) {
    throw new CompassError(d.friendlyMessage?.trim() || "Compass did not accept that username and password.", "bad-credentials");
  }
  const cookies = readSetCookies(res.headers);
  if (!Object.keys(cookies).length) throw new CompassError("Compass signed in but sent no session.", "upstream");
  const session = new CompassSession(slug, cookies);
  await session.resolveUserId();
  return session;
}

export class CompassSession {
  userId: number | null;

  constructor(
    readonly slug: string,
    public cookies: Cookies,
    userId?: number | null,
  ) {
    this.userId = userId ?? null;
  }

  get origin() {
    return schoolOrigin(this.slug);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "User-Agent": USER_AGENT, Cookie: cookieHeader(this.cookies), ...extra };
  }

  /** Keeps any cookie Compass rotates, so the session stays alive across calls. */
  private absorb(res: Response) {
    const fresh = readSetCookies(res.headers);
    if (Object.keys(fresh).length) this.cookies = { ...this.cookies, ...fresh };
  }

  /** A JSON service call, such as "/Services/Calendar.svc/GetCalendarEventsByUser". Returns the body as sent. */
  async request<T = unknown>(endpoint: string, method: "GET" | "POST" = "POST", body?: unknown): Promise<T> {
    const res = await fetch(new URL(endpoint, this.origin), {
      method,
      headers: this.headers({ Accept: "application/json", "Content-Type": "application/json" }),
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      redirect: "manual",
    });
    this.absorb(res);
    if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
      throw new CompassError("The Compass session has ended.", "expired", res.status);
    }
    if (res.status === 403 && res.headers.get("cf-mitigated")) throw new CompassError("Compass's firewall refused the call.", "blocked", 403);
    // An ended session can also come back as the login page itself, 200 and HTML, where JSON should be.
    if (/text\/html/i.test(res.headers.get("content-type") ?? "")) {
      await res.body?.cancel();
      throw new CompassError("The Compass session has ended.", "expired", res.status);
    }
    if (!res.ok) throw new CompassError(`Compass answered ${res.status} for ${endpoint}.`, "upstream", res.status);
    return (await res.json()) as T;
  }

  /** An HTML page with the session's cookies. */
  async page(path = "/"): Promise<string> {
    const res = await fetch(new URL(path, this.origin), { headers: this.headers({ Accept: "text/html" }), redirect: "manual" });
    this.absorb(res);
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get("location") ?? "";
      if (/login\.aspx/i.test(to)) throw new CompassError("The Compass session has ended.", "expired", res.status);
      return this.page(to);
    }
    if (!res.ok) throw new CompassError(`Compass answered ${res.status} for ${path}.`, "upstream", res.status);
    return res.text();
  }

  /**
   * An image Compass serves to signed-in people, such as a profile photo (UserDetails.photoPath). Null when it is not
   * an image: a photo that is missing, or a session that has ended and answers with the login page instead.
   */
  async image(path: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
    const res = await fetch(new URL(path, this.origin), { headers: this.headers({ Accept: "image/*" }), redirect: "follow" });
    this.absorb(res);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\//i.test(type)) {
      await res.body?.cancel();
      return null;
    }
    return { bytes: await res.arrayBuffer(), type };
  }

  /**
   * A file Compass serves to signed-in people (a lesson plan, an attachment). Null when there is no file: Compass
   * answers an unknown or refused one with an error page, and an ended session with the login page.
   */
  async file(path: string): Promise<{ bytes: ArrayBuffer; type: string; name: string | null } | null> {
    const res = await fetch(new URL(path, this.origin), { headers: this.headers({ Accept: "*/*" }), redirect: "manual" });
    this.absorb(res);
    if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
      await res.body?.cancel();
      throw new CompassError("The Compass session has ended.", "expired", res.status);
    }
    const type = res.headers.get("content-type") ?? "";
    const disposition = res.headers.get("content-disposition") ?? "";
    if (!res.ok || (/text\/html/i.test(type) && !/attachment|filename/i.test(disposition))) {
      await res.body?.cancel();
      return null;
    }
    const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
    return { bytes: await res.arrayBuffer(), type, name: name ? decodeURIComponent(name) : null };
  }

  /**
   * A multipart upload (a file for a learning task). Compass's upload handler answers an ExtJS form, which reads the
   * body as JSON whatever its content type, so the body is parsed as JSON here too; the login page in its place means
   * the session has ended.
   */
  async upload<T = unknown>(path: string, form: FormData): Promise<T> {
    const res = await fetch(new URL(path, this.origin), {
      method: "POST",
      headers: this.headers({ Accept: "application/json, text/html;q=0.9" }),
      body: form,
      redirect: "manual",
    });
    this.absorb(res);
    if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
      await res.body?.cancel();
      throw new CompassError("The Compass session has ended.", "expired", res.status);
    }
    if (res.status === 403 && res.headers.get("cf-mitigated")) throw new CompassError("Compass's firewall refused the upload.", "blocked", 403);
    const text = await res.text();
    if (!res.ok) throw new CompassError(`Compass answered ${res.status} to the upload.`, "upstream", res.status);
    try {
      return JSON.parse(text) as T;
    } catch {
      if (/login\.aspx|<form[^>]+login/i.test(text)) throw new CompassError("The Compass session has ended.", "expired", res.status);
      throw new CompassError("Compass did not say whether the upload worked.", "upstream", res.status);
    }
  }

  /** Compass writes the signed-in user's id into every page as Compass.organisationUserId. */
  async resolveUserId(): Promise<number> {
    if (this.userId != null) return this.userId;
    const html = await this.page("/");
    const m = /organisationUserId\s*[:=]\s*["']?(\d+)/.exec(html);
    if (!m?.[1]) throw new CompassError("Compass signed in but did not say who you are.", "upstream");
    this.userId = Number(m[1]);
    return this.userId;
  }

  toJSON() {
    return { slug: this.slug, cookies: this.cookies, userId: this.userId };
  }

  static fromJSON(v: { slug: string; cookies: Cookies; userId: number | null }) {
    return new CompassSession(v.slug, v.cookies, v.userId);
  }
}
