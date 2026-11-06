import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { CompassError, getUserDetails, normalizeSlug, probeSchool, signIn as compassSignIn } from "@compassneo/compass";
import { hashToken, newToken, seal } from "./lib/crypto";
import { type Problem } from "./lib/compass";
import { accountKey, forgetAccount, sweepFarewells } from "./accounts";
import { dropDevices, sweepPush } from "./push";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const ATTEMPT_WINDOW = 10 * MINUTE;
const ATTEMPT_LIMIT = 6;
/**
 * A guest's sign-in (guest mode: a friend checking their timetable on someone else's device) ends by itself this long
 * after it began, if nobody signed it out: about a school day. The hourly sweep ends it; the device finds it gone and
 * goes back to its own account.
 */
export const GUEST_FOR = 8 * HOUR;

export type Me = {
  slug: string;
  schoolName: string;
  username: string;
  displayName: string;
  fullName: string | null;
  formGroup: string | null;
  /** WA public schools also have Connect (grades), signed in to with the same login. */
  connect: boolean;
  /** Signed in before logins were kept: when Compass ends the session, this device has to sign in again. */
  needsSignIn: boolean;
  /** The Compass profile photo, once a sync has copied it. */
  photoUrl: string | null;
  /** A guest's sign-in on someone else's device: it reads the timetable only, and ends by itself (GUEST_FOR). */
  guest: boolean;
};

export type SignInResult =
  /** cached: the account was synced before (another device, a sign-in again), so the app can open on that at once. */
  | { ok: true; token: string; me: Me; cached: boolean }
  | {
      ok: false;
      code: "bad-credentials" | "two-factor" | "blocked" | "expired" | "unknown-school" | "upstream" | "rate-limited";
      message: string;
    };

const isWA = (slug: string) => /-wa$/.test(slug);

/**
 * Signs in to the school's Compass with the mobile-app endpoint. On success the login is kept, sealed under
 * CREDENTIALS_KEY, so Compass Neo can sign in again by itself when Compass ends the session (it does, daily), and so
 * Connect can use the same login. It is deleted when the last device signs out.
 *
 * guest: a friend signing in on someone else's device, beside that device's own sign-in (guest mode). Their session
 * reads the timetable and nothing else (timetable.ts accountFor, lib/compass.ts deviceAccount: grades are left off the
 * day), takes no notifications, and ends by itself after GUEST_FOR. Signing it out is signing out of a device as ever:
 * if it was the account's only one, the account and its login go with it.
 */
export const signIn = action({
  args: { slug: v.string(), username: v.string(), password: v.string(), guest: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<SignInResult> => {
    const slug = normalizeSlug(args.slug);
    const username = args.username.trim();
    if (!slug) return { ok: false, code: "unknown-school", message: "That is not a Compass school address." };
    if (!username || !args.password) return { ok: false, code: "bad-credentials", message: "Enter your username and password." };

    const key = accountKey(slug, username);
    const allowed = await ctx.runMutation(internal.auth.noteAttempt, { key });
    if (!allowed) return { ok: false, code: "rate-limited", message: "Too many tries for this account. Wait ten minutes, then try again." };

    let session;
    try {
      session = await compassSignIn({ slug, username, password: args.password });
    } catch (e) {
      // compassSignIn has already tried a hiccup three times (packages/compass/src/retry.ts); what is left is an answer.
      if (e instanceof CompassError) return { ok: false, code: e.code, message: e.message };
      // The network still failing after those tries reads to the person as Compass not answering, not as a crash.
      return { ok: false, code: "upstream", message: "Compass did not answer. Try again in a minute." };
    }

    const details = await getUserDetails(session).catch(() => null);
    let schoolName = (await ctx.runQuery(internal.schools.bySlug, { slug }))?.name ?? null;
    if (!schoolName) {
      const p = await probeSchool(slug).catch(() => null);
      schoolName = p?.kind === "found" ? p.name : slug;
      if (p?.kind === "found") await ctx.runMutation(internal.schools.upsert, { slug, name: p.name, organisationId: null });
    }

    const me: Me = {
      slug,
      schoolName,
      username,
      displayName: details?.preferredName || details?.firstName || username,
      fullName: details?.fullName ?? null,
      formGroup: details?.formGroup ?? null,
      connect: isWA(slug),
      needsSignIn: false,
      photoUrl: null,
      guest: !!args.guest,
    };
    const token = newToken();
    const accountId = await ctx.runMutation(internal.accounts.signedIn, {
      tokenHash: await hashToken(token),
      key,
      slug,
      username,
      schoolName,
      compassUserId: session.userId ?? 0,
      displayName: me.displayName,
      fullName: me.fullName ?? undefined,
      formGroup: me.formGroup ?? undefined,
      sealedLogin: await seal("CREDENTIALS_KEY", { username, password: args.password }, key),
      sealedCompass: await seal("SESSION_KEY", session.cookies, key),
      guest: args.guest || undefined,
    });
    // Sync now (Compass, and Connect at a WA school), so everything is there as the app opens; the app draws it. The run
    // waits its turn in the sync pool (convex/sync.ts), so this answers at once. An account already synced opens on
    // what it has (cached) while the run carries on behind the app.
    const { cached } = await ctx.runMutation(internal.sync.signedIn, { accountId });
    return { ok: true, token, me, cached };
  },
});

/** Who this device is signed in as, or null. */
export const me = query({
  args: { token: v.union(v.string(), v.null()) },
  handler: async (ctx, { token }): Promise<Me | null> => {
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const session = await ctx.db.query("sessions").withIndex("by_token", i => i.eq("tokenHash", tokenHash)).first();
    const a = session && (await ctx.db.get(session.accountId));
    if (!a) return null;
    return {
      slug: a.slug,
      schoolName: a.schoolName,
      username: a.username,
      displayName: a.displayName,
      fullName: a.fullName ?? null,
      formGroup: a.formGroup ?? null,
      connect: isWA(a.slug),
      needsSignIn: !a.sealedLogin,
      photoUrl: a.photoId ? await ctx.storage.getUrl(a.photoId) : null,
      guest: !!session.guest,
    };
  },
});

/** Signs this device out. The last device out takes the account, its stored login and its caches with it. */
export const signOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const rows = await ctx.db.query("sessions").withIndex("by_token", i => i.eq("tokenHash", tokenHash)).collect();
    for (const r of rows) {
      await dropDevices(ctx, r._id);
      await ctx.db.delete(r._id);
      const others = await ctx.db.query("sessions").withIndex("by_account", i => i.eq("accountId", r.accountId)).first();
      const account = await ctx.db.get(r.accountId);
      if (!others && account) await forgetAccount(ctx, account);
    }
  },
});

// ---------- internals ----------

/** Records an attempt and says whether it may go ahead. */
export const noteAttempt = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const since = Date.now() - ATTEMPT_WINDOW;
    const recent = await ctx.db
      .query("attempts")
      .withIndex("by_key_at", i => i.eq("key", key).gt("at", since))
      .take(ATTEMPT_LIMIT);
    if (recent.length >= ATTEMPT_LIMIT) return false;
    await ctx.db.insert("attempts", { key, at: Date.now() });
    return true;
  },
});

/**
 * Drops old attempts, old farewells (accounts.ts), devices nobody has used in a month, and guests' sign-ins older than
 * GUEST_FOR (an account with no devices left goes too).
 */
export const sweep = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    const oldAttempts = await ctx.db.query("attempts").withIndex("by_key_at").filter(q => q.lt(q.field("at"), now - ATTEMPT_WINDOW)).take(500);
    for (const a of oldAttempts) await ctx.db.delete(a._id);
    await sweepFarewells(ctx, now);
    await sweepPush(ctx, now);
    const stale = await ctx.db.query("sessions").withIndex("by_lastSeen", i => i.lt("lastSeenAt", now - 30 * 24 * HOUR)).take(200);
    const guests = await ctx.db.query("sessions").withIndex("by_guest", i => i.eq("guest", true).lt("createdAt", now - GUEST_FOR)).take(200);
    const seen = new Set<string>();
    for (const s of [...stale, ...guests]) {
      if (seen.has(s._id)) continue;
      seen.add(s._id);
      await dropDevices(ctx, s._id);
      await ctx.db.delete(s._id);
      const others = await ctx.db.query("sessions").withIndex("by_account", i => i.eq("accountId", s.accountId)).first();
      const account = await ctx.db.get(s.accountId);
      if (!others && account) await forgetAccount(ctx, account);
    }
  },
});
