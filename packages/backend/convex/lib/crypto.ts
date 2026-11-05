/**
 * Secrets at rest.
 *
 * - The browser keeps a random session token; the database keeps only its SHA-256, so a leaked table cannot be
 *   replayed.
 * - Sealed values use AES-256-GCM with a key from the Convex environment, never from the database:
 *     SESSION_KEY      Compass and Connect session cookies
 *     CREDENTIALS_KEY  each account's username and password, kept so Compass Neo can sign in again when Compass or
 *                      Connect ends a session (Compass does this daily)
 *   Each is 32 random bytes, base64. A database export alone opens nothing.
 * - Every sealed value is bound to the account it belongs to (AES-GCM associated data), so a ciphertext copied onto
 *   another account's row fails to open.
 *
 * Format: "v2.<iv>.<ciphertext>" in base64url. Values written before v2 ("<iv>.<ciphertext>", no binding) still open.
 */

export type KeyName = "SESSION_KEY" | "CREDENTIALS_KEY";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 32 random bytes. Actions only: queries and mutations have no randomness. */
export function newToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return toBase64Url(new Uint8Array(digest));
}

const keys = new Map<KeyName, Promise<CryptoKey>>();

function key(name: KeyName): Promise<CryptoKey> {
  let k = keys.get(name);
  if (!k) {
    const raw = process.env[name];
    if (!raw) throw new Error(`${name} is not set. Run: npx convex env set ${name} <32 random bytes, base64>`);
    const bytes = fromBase64(raw);
    if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded.`);
    k = crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
    keys.set(name, k);
  }
  return k;
}

/** Seals a value under a named key, bound to `boundTo` (the account it belongs to). */
export async function seal(keyName: KeyName, value: unknown, boundTo: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(boundTo) },
    await key(keyName),
    enc.encode(JSON.stringify(value)),
  );
  return `v2.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(data))}`;
}

/** Opens a sealed value. Throws if the key, the binding or the ciphertext is wrong. */
export async function unseal<T>(keyName: KeyName, sealed: string, boundTo: string): Promise<T> {
  const parts = sealed.split(".");
  const v2 = parts[0] === "v2";
  const [iv, data] = v2 ? parts.slice(1) : parts;
  if (!iv || !data) throw new Error("Malformed sealed value.");
  const params: AesGcmParams = v2
    ? { name: "AES-GCM", iv: fromBase64(iv), additionalData: enc.encode(boundTo) }
    : { name: "AES-GCM", iv: fromBase64(iv) };
  const plain = await crypto.subtle.decrypt(params, await key(keyName), fromBase64(data));
  return JSON.parse(dec.decode(plain)) as T;
}
