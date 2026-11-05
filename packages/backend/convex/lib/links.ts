import type { Id } from "../_generated/dataModel";

/**
 * Links to files that live on Compass or Connect (a class's resources, a task's attachment, what a student handed in, a
 * classmate's photo). A browser cannot fetch them itself: they need the account's session cookies, which never leave
 * Convex. So the app links to Compass Neo's own route (http.ts, GET /file/...), which fetches the file with the session
 * and passes it on.
 *
 * Each link names one file of one account and carries an HMAC of both under SESSION_KEY, so it cannot be bent to
 * another file or account. A link lives as long as its account: signing out deletes the account, and the route then
 * finds nobody to fetch for. Rotating SESSION_KEY ends every link.
 */

export type FileSource = "compass" | "connect";

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

let keyPromise: Promise<CryptoKey> | null = null;
function key() {
  keyPromise ??= (async () => {
    const raw = process.env.SESSION_KEY;
    if (!raw) throw new Error("SESSION_KEY is not set.");
    return crypto.subtle.importKey("raw", fromB64url(raw.replace(/=+$/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  })();
  return keyPromise;
}

/** Every MAC is over this prefix and the payload, so it can never stand for anything else made with the key. */
const DOMAIN = "compassneo/file-link/v1:";
const macOf = async (payload: string) => new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(DOMAIN + payload))).slice(0, 18);

const PATHS: Record<FileSource, RegExp> = {
  compass: /^\/Services\/(FileAssets\.svc\/DownloadFile|FileDownload\/FileRequestHandler)\?/,
  connect: /^\/connectapi\/files\//,
};

/** The site URL Convex serves http.ts on. */
const site = () => (process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "");

/** A link to one file of one account. name is what the browser saves it as. */
export async function fileLink(accountId: Id<"accounts">, source: FileSource, path: string, name: string): Promise<string | null> {
  if (!PATHS[source].test(path)) return null;
  const payload = b64url(enc.encode(JSON.stringify({ a: accountId, s: source, p: path })));
  const mac = await macOf(payload);
  const safe = encodeURIComponent(name.replace(/[\\/]+/g, "-").slice(0, 120) || "file");
  return `${site()}/file/${payload}.${b64url(mac)}/${safe}`;
}

/** Many links at once (one key, one pass). */
export async function fileLinks<T>(accountId: Id<"accounts">, items: T[], of: (t: T) => { source: FileSource; path: string; name: string } | null) {
  const out = new Map<T, string>();
  for (const t of items) {
    const f = of(t);
    if (!f) continue;
    const url = await fileLink(accountId, f.source, f.path, f.name);
    if (url) out.set(t, url);
  }
  return out;
}

/** What a link names, if its MAC is right. */
export async function readLink(token: string): Promise<{ accountId: Id<"accounts">; source: FileSource; path: string } | null> {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const want = await macOf(payload);
  let got: Uint8Array;
  try {
    got = fromB64url(mac);
  } catch {
    return null;
  }
  if (got.length !== want.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i]! ^ got[i]!;
  if (diff !== 0) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { a: string; s: FileSource; p: string };
    if ((v.s !== "compass" && v.s !== "connect") || !PATHS[v.s].test(v.p)) return null;
    return { accountId: v.a as Id<"accounts">, source: v.s, path: v.p };
  } catch {
    return null;
  }
}
