import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { ConnectError, ConnectSession, connectSignIn, type StoredCookie } from "@compassneo/connect";
import { seal, unseal } from "./crypto";
import { storedLogin, type Result } from "./compass";

export const isWA = (slug: string) => /-wa$/.test(slug);

type Sealed = { cookies: StoredCookie[]; studentId: number | null };

async function save(ctx: ActionCtx, account: Doc<"accounts">, session: ConnectSession, fresh: boolean) {
  await ctx.runMutation(internal.accounts.saveConnect, {
    accountId: account._id,
    sealedConnect: await seal("SESSION_KEY", session.toJSON(), account.key),
    connectStudentId: session.studentId ?? undefined,
    fresh,
  });
}

/**
 * Runs fn with the account's Connect session, signing in with the stored Compass login when there is none or Connect
 * has ended it. Connect refusing the login does not touch the Compass account: a WA school can use Compass without
 * the student having a DET login that Connect accepts.
 */
export async function withConnect<T>(ctx: ActionCtx, account: Doc<"accounts">, fn: (s: ConnectSession) => Promise<T>): Promise<Result<T>> {
  if (!isWA(account.slug)) return { ok: false, code: "unavailable", message: "Connect is only for WA public schools." };
  const stored = account.sealedConnect ? await unseal<Sealed>("SESSION_KEY", account.sealedConnect, account.key).catch(() => null) : null;
  let session: ConnectSession | null = stored ? new ConnectSession(stored.cookies, stored.studentId) : null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session) {
      const login = await storedLogin(account);
      if (!login) return { ok: false, code: "unavailable", message: "Sign in again so Compass Neo can open Connect for you." };
      try {
        session = await connectSignIn(login);
        await save(ctx, account, session, true);
      } catch (e) {
        if (!(e instanceof ConnectError)) throw e;
        if (e.code === "bad-credentials") return { ok: false, code: "unavailable", message: "Connect did not accept your Compass login." };
        if (e.code === "mfa") return { ok: false, code: "unavailable", message: "Connect asks this account for a second sign-in step." };
        return { ok: false, code: "upstream", message: e.message };
      }
    }
    const before = JSON.stringify(session.toJSON());
    try {
      const value = await fn(session);
      if (JSON.stringify(session.toJSON()) !== before) await save(ctx, account, session, false);
      return { ok: true, value };
    } catch (e) {
      if (!(e instanceof ConnectError)) throw e;
      if (e.code !== "expired" || attempt === 1) return { ok: false, code: "upstream", message: e.message };
      session = null;
    }
  }
  return { ok: false, code: "upstream", message: "Connect did not answer." };
}
