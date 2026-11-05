import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { CompassError, CompassSession, signIn, type Cookies } from "@compassneo/compass";
import { hashToken, seal, unseal } from "./crypto";

export type Login = { username: string; password: string };

/** Why a call for a device could not be made. The client signs out on "signed-out" and "password-changed". */
export type Problem =
  | { ok: false; code: "signed-out"; message: string }
  | { ok: false; code: "password-changed"; message: string }
  | { ok: false; code: "unavailable"; message: string }
  | { ok: false; code: "upstream"; message: string };

export type Result<T> = { ok: true; value: T } | Problem;

export async function deviceAccount(ctx: ActionCtx, token: string) {
  const found = await ctx.runQuery(internal.accounts.byTokenHash, { tokenHash: await hashToken(token) });
  if (found) await ctx.runMutation(internal.accounts.touch, { sessionId: found.session._id });
  return found?.account ?? null;
}

export async function storedLogin(account: Doc<"accounts">): Promise<Login | null> {
  if (!account.sealedLogin) return null;
  return unseal<Login>("CREDENTIALS_KEY", account.sealedLogin, account.key);
}

/** What to do when a stored login can no longer sign in: forget the account, so every device is asked again. */
export async function loginRejected(ctx: ActionCtx, account: Doc<"accounts">): Promise<Problem> {
  await ctx.runMutation(internal.accounts.forget, { accountId: account._id });
  return { ok: false, code: "password-changed", message: "Your Compass password has changed. Sign in again." };
}

async function signInAgain(ctx: ActionCtx, account: Doc<"accounts">): Promise<CompassSession | Problem> {
  const login = await storedLogin(account);
  if (!login) {
    // Signed in before logins were kept: there is nothing to sign in again with.
    await ctx.runMutation(internal.accounts.forget, { accountId: account._id });
    return { ok: false, code: "signed-out", message: "Compass ended your session. Sign in again." };
  }
  try {
    const session = await signIn({ slug: account.slug, ...login });
    await ctx.runMutation(internal.accounts.saveCompass, {
      accountId: account._id,
      sealedCompass: await seal("SESSION_KEY", session.cookies, account.key),
      fresh: true,
    });
    return session;
  } catch (e) {
    if (e instanceof CompassError && e.code === "bad-credentials") return loginRejected(ctx, account);
    if (e instanceof CompassError) return { ok: false, code: "upstream", message: e.message };
    throw e;
  }
}

/**
 * Runs fn with the account's Compass session. If Compass has ended it, signs in again with the stored login and
 * runs fn once more. Cookies Compass rotates along the way are kept.
 */
export async function withCompass<T>(
  ctx: ActionCtx,
  account: Doc<"accounts">,
  fn: (session: CompassSession) => Promise<T>,
): Promise<Result<T>> {
  const cookies = await unseal<Cookies>("SESSION_KEY", account.sealedCompass, account.key).catch(() => null);
  let session: CompassSession | Problem = cookies
    ? new CompassSession(account.slug, cookies, account.compassUserId || null)
    : await signInAgain(ctx, account);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(session instanceof CompassSession)) return session;
    const before = JSON.stringify(session.cookies);
    try {
      const value = await fn(session);
      if (JSON.stringify(session.cookies) !== before) {
        await ctx.runMutation(internal.accounts.saveCompass, {
          accountId: account._id,
          sealedCompass: await seal("SESSION_KEY", session.cookies, account.key),
          fresh: false,
        });
      }
      return { ok: true, value };
    } catch (e) {
      if (!(e instanceof CompassError)) throw e;
      if (e.code !== "expired" || attempt === 1) return { ok: false, code: "upstream", message: e.message };
      session = await signInAgain(ctx, account);
    }
  }
  return { ok: false, code: "upstream", message: "Compass did not answer." };
}
