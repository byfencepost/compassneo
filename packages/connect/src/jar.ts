/**
 * A small cookie jar for a sign-in that hops between hosts (connect.det.wa.edu.au and login.det.wa.edu.au). It keeps
 * what a browser would for these hosts: host-only and domain cookies, paths, and expiry by Max-Age or Expires.
 */

export type StoredCookie = { name: string; value: string; domain: string; hostOnly: boolean; path: string; expires: number | null };

export class CookieJar {
  constructor(public cookies: StoredCookie[] = []) {}

  /** Takes in every Set-Cookie on a response from url. */
  absorb(url: string, headers: Headers) {
    const h = headers as Headers & { getSetCookie?: () => string[] };
    const lines = typeof h.getSetCookie === "function" ? h.getSetCookie() : (headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,\s]+=)/).filter(Boolean);
    const u = new URL(url);
    for (const line of lines) this.set(u, line);
  }

  private set(u: URL, line: string) {
    const [pair, ...attrs] = line.split(";");
    const eq = pair!.indexOf("=");
    if (eq <= 0) return;
    const name = pair!.slice(0, eq).trim();
    const value = pair!.slice(eq + 1).trim();
    let domain = u.hostname;
    let hostOnly = true;
    let path = u.pathname.replace(/\/[^/]*$/, "") || "/";
    let expires: number | null = null;
    for (const a of attrs) {
      const [k, ...rest] = a.split("=");
      const key = k!.trim().toLowerCase();
      const val = rest.join("=").trim();
      if (key === "domain" && val) {
        const d = val.replace(/^\./, "").toLowerCase();
        // Only a domain the host belongs to may be set.
        if (u.hostname === d || u.hostname.endsWith(`.${d}`)) {
          domain = d;
          hostOnly = false;
        }
      } else if (key === "path" && val.startsWith("/")) path = val;
      else if (key === "max-age") expires = Date.now() + Number(val) * 1000;
      else if (key === "expires" && expires === null) {
        const t = Date.parse(val);
        if (Number.isFinite(t)) expires = t;
      }
    }
    this.cookies = this.cookies.filter(c => !(c.name === name && c.domain === domain && c.path === path));
    if (expires === null || expires > Date.now()) this.cookies.push({ name, value, domain, hostOnly, path, expires });
  }

  /** The Cookie header for a request to url. */
  header(url: string): string {
    const u = new URL(url);
    const now = Date.now();
    return this.cookies
      .filter(c => (c.expires === null || c.expires > now) && (c.hostOnly ? u.hostname === c.domain : u.hostname === c.domain || u.hostname.endsWith(`.${c.domain}`)))
      .filter(c => u.pathname === c.path || u.pathname.startsWith(c.path.endsWith("/") ? c.path : `${c.path}/`) || c.path === "/")
      .sort((a, b) => b.path.length - a.path.length)
      .map(c => `${c.name}=${c.value}`)
      .join("; ");
  }

  get(name: string, host?: string): string | null {
    return this.cookies.find(c => c.name === name && (!host || host === c.domain || host.endsWith(`.${c.domain}`)))?.value ?? null;
  }

  toJSON() {
    return this.cookies;
  }
}
