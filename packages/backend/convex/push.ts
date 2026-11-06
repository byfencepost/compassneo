import { v } from "convex/values";
import { internalAction, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { hashToken } from "./lib/crypto";
import { schoolToday } from "./lib/days";

/**
 * Push notifications, through Expo's push service (the phone app registers its Expo push token here). What sets them
 * off lives beside what it watches:
 *   work, marks  a sync finding new work set, or a mark or result back (convex/work.ts, connect's grades, canvas.ts);
 *                a new mark also asks the student's classmates on Compass Neo to check theirs now (`nudgeClassmates`)
 *   changes      an hour before the day's first class: relief teachers and room changes today (convex/brief.ts)
 *   notices      the day's notices, once read (convex/announcements.ts)
 *
 * Every notification goes through `notify`, which tells each thing once per account (pushLog), however many syncs
 * see it, and only to the devices that want that kind. A device that Expo says is gone (the app deleted, notifications
 * turned off in a way Apple reports) is dropped when a send finds out.
 */

export type PushKind = "work" | "marks" | "changes" | "notices";

/** One notification: what it is about (for the device's settings), what it says, and where tapping it goes in the app. */
export type Push = {
  kind: PushKind;
  title: string;
  body: string;
  /** An app route: "/class/10CP1?tab=work", "/notices", "/". */
  url?: string;
  /** The timetable class it is about ("10CP1"), when it is about one: it counts against that class's share of the day. */
  code?: string;
};

export type PushPrefs = Doc<"pushDevices">["prefs"];

const ALL_ON: PushPrefs = { work: true, marks: true, changes: true, notices: true };
const prefsV = v.object({ work: v.optional(v.boolean()), marks: v.optional(v.boolean()), changes: v.optional(v.boolean()), notices: v.optional(v.boolean()) });

/**
 * The day's budget, so a busy day never turns into a stream: each class gets PER_CLASS notifications a school day, and
 * the account PER_CLASS for each of its classes in all (10 classes, 20 a day), never fewer than MIN_DAILY. The morning
 * brief ("changes") is once a day and asked for by name, so it is outside the budget.
 */
const PER_CLASS = 2;
const MIN_DAILY = 8;

/** Kept this long, then swept: long enough that nothing is told twice, short enough that the log stays small. */
const LOG_KEEP = 45 * 24 * 60 * 60 * 1000;
const NUDGE_KEEP = 2 * 24 * 60 * 60 * 1000;
/** Expo takes at most this many messages per request. */
const SEND_BATCH = 100;
/** A body past this is cut (Expo's payload limit is 4 KB, and a lock screen shows a few lines). */
const BODY_MAX = 240;

/** The device a token is for. A guest's sign-in (auth.ts) takes no notifications: it is someone else's phone. */
async function sessionOf(ctx: QueryCtx, token: string) {
  const tokenHash = await hashToken(token);
  const session = await ctx.db.query("sessions").withIndex("by_token", i => i.eq("tokenHash", tokenHash)).first();
  return session?.guest ? null : session;
}

const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

// ---------- the app's side ----------

/**
 * This device takes notifications at this Expo push token. Called whenever the app has a token (every launch: the
 * token can change). A token already registered under another sign-in (the phone signed in to someone else since)
 * moves to this one. Returns the device's settings.
 */
export const register = mutation({
  args: { token: v.string(), pushToken: v.string(), platform: v.union(v.literal("ios"), v.literal("android")) },
  handler: async (ctx, { token, pushToken, platform }) => {
    const session = await sessionOf(ctx, token);
    if (!session || !isExpoToken(pushToken)) return null;
    const now = Date.now();
    for (const d of await ctx.db.query("pushDevices").withIndex("by_token", i => i.eq("token", pushToken)).collect()) {
      if (d.sessionId !== session._id) await ctx.db.delete(d._id);
    }
    const mine = await ctx.db.query("pushDevices").withIndex("by_session", i => i.eq("sessionId", session._id)).first();
    if (mine) {
      if (mine.token !== pushToken || mine.platform !== platform || mine.accountId !== session.accountId)
        await ctx.db.patch(mine._id, { token: pushToken, platform, accountId: session.accountId, updatedAt: now });
      return mine.prefs;
    }
    await ctx.db.insert("pushDevices", { accountId: session.accountId, sessionId: session._id, token: pushToken, platform, prefs: ALL_ON, createdAt: now, updatedAt: now });
    return ALL_ON;
  },
});

/** This device stops taking notifications (turned off in the app's settings). */
export const unregister = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await sessionOf(ctx, token);
    if (session) await dropDevices(ctx, session._id);
  },
});

/** What this device is told about, or null when it takes no notifications. */
export const prefs = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await sessionOf(ctx, token);
    if (!session) return null;
    const d = await ctx.db.query("pushDevices").withIndex("by_session", i => i.eq("sessionId", session._id)).first();
    return d?.prefs ?? null;
  },
});

/** Turns kinds of notification on or off for this device. */
export const setPrefs = mutation({
  args: { token: v.string(), prefs: prefsV },
  handler: async (ctx, { token, prefs: change }) => {
    const session = await sessionOf(ctx, token);
    if (!session) return null;
    const d = await ctx.db.query("pushDevices").withIndex("by_session", i => i.eq("sessionId", session._id)).first();
    if (!d) return null;
    const next: PushPrefs = {
      work: change.work ?? d.prefs.work,
      marks: change.marks ?? d.prefs.marks,
      changes: change.changes ?? d.prefs.changes,
      notices: change.notices ?? d.prefs.notices,
    };
    await ctx.db.patch(d._id, { prefs: next, updatedAt: Date.now() });
    return next;
  },
});

// ---------- telling ----------

/**
 * Tells an account's devices about something, once: `key` names what it is about ("mark:compass:123",
 * "brief:2026-11-06", "news:abc"), and a key told before is told again never. The key is logged even when no device
 * takes this kind, so a phone that turns notifications on later is not told old news. Sending happens after the
 * mutation commits (an action). Returns whether it was new.
 */
export async function notify(ctx: MutationCtx, accountId: Id<"accounts">, key: string, push: Push): Promise<boolean> {
  const seen = await ctx.db.query("pushLog").withIndex("by_account_key", i => i.eq("accountId", accountId).eq("key", key)).first();
  if (seen) return false;
  const account = await ctx.db.get(accountId);
  if (!account) return false;
  const now = Date.now();
  const day = schoolToday(account.slug);
  const devices = (await ctx.db.query("pushDevices").withIndex("by_account", i => i.eq("accountId", accountId)).collect()).filter(d => d.prefs[push.kind]);
  const send = devices.length > 0 && (push.kind === "changes" || (await withinBudget(ctx, accountId, day, push.code)));
  // Logged whether or not it goes out: a thing over the budget, or that no device wanted, is not told later either.
  await ctx.db.insert("pushLog", { accountId, key, at: now, day, kind: push.kind, ...(push.code ? { code: push.code } : {}), sent: send });
  if (!send) return true;
  const body = push.body.length > BODY_MAX ? `${push.body.slice(0, BODY_MAX - 1).trimEnd()}…` : push.body;
  await ctx.scheduler.runAfter(0, internal.push.send, {
    messages: devices.map(d => ({ to: d.token, title: push.title, body, data: { kind: push.kind, url: push.url ?? null } })),
  });
  return true;
}

/** Whether one more notification fits in the day's budget: the class's share, and the account's in all. */
async function withinBudget(ctx: QueryCtx, accountId: Id<"accounts">, day: string, code: string | undefined) {
  const sent = (await ctx.db.query("pushLog").withIndex("by_account_day", i => i.eq("accountId", accountId).eq("day", day)).collect()).filter(
    l => l.sent && l.kind !== "changes",
  );
  if (code && sent.filter(l => l.code === code).length >= PER_CLASS) return false;
  const classes = (await ctx.db.query("classMembers").withIndex("by_account", i => i.eq("accountId", accountId)).collect()).length;
  return sent.length < Math.max(MIN_DAILY, PER_CLASS * classes);
}

/** Whether something was told already (to check before working out an expensive message). */
export async function told(ctx: QueryCtx, accountId: Id<"accounts">, key: string) {
  return !!(await ctx.db.query("pushLog").withIndex("by_account_key", i => i.eq("accountId", accountId).eq("key", key)).first());
}

/** Sends messages through Expo's push service, a hundred at a time, and drops the devices Expo says are gone. */
export const send = internalAction({
  args: {
    messages: v.array(v.object({ to: v.string(), title: v.string(), body: v.string(), data: v.object({ kind: v.string(), url: v.union(v.string(), v.null()) }) })),
  },
  handler: async (ctx, { messages }) => {
    const gone: string[] = [];
    for (let i = 0; i < messages.length; i += SEND_BATCH) {
      const batch = messages.slice(i, i + SEND_BATCH).map(m => ({ ...m, sound: "default", priority: "high" }));
      let res: Response;
      try {
        res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            // Only needed once the Expo project turns on enhanced push security.
            ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(batch),
        });
      } catch (e) {
        console.warn("push: Expo did not answer", e);
        continue;
      }
      if (!res.ok) {
        console.warn("push: Expo refused a batch", res.status, await res.text().catch(() => ""));
        continue;
      }
      const tickets = ((await res.json()) as { data?: Array<{ status: "ok" | "error"; message?: string; details?: { error?: string } }> }).data ?? [];
      tickets.forEach((t, j) => {
        if (t.status !== "error") return;
        if (t.details?.error === "DeviceNotRegistered") gone.push(batch[j]!.to);
        else console.warn("push: not sent", t.details?.error ?? t.message);
      });
    }
    if (gone.length) await ctx.runMutation(internal.push.forgetTokens, { tokens: gone });
  },
});

export const forgetTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    for (const token of tokens) for (const d of await ctx.db.query("pushDevices").withIndex("by_token", i => i.eq("token", token)).collect()) await ctx.db.delete(d._id);
  },
});

// ---------- housekeeping (called where sessions and accounts go: convex/auth.ts, convex/accounts.ts) ----------

/** A device signed out: it takes no more notifications. */
export async function dropDevices(ctx: MutationCtx, sessionId: Id<"sessions">) {
  for (const d of await ctx.db.query("pushDevices").withIndex("by_session", i => i.eq("sessionId", sessionId)).collect()) await ctx.db.delete(d._id);
}

/** An account forgotten: its devices, what it was told, and its place in its classes. */
export async function forgetPush(ctx: MutationCtx, accountId: Id<"accounts">) {
  for (const d of await ctx.db.query("pushDevices").withIndex("by_account", i => i.eq("accountId", accountId)).collect()) await ctx.db.delete(d._id);
  for (const l of await ctx.db.query("pushLog").withIndex("by_account_key", i => i.eq("accountId", accountId)).collect()) await ctx.db.delete(l._id);
  for (const m of await ctx.db.query("classMembers").withIndex("by_account", i => i.eq("accountId", accountId)).collect()) await ctx.db.delete(m._id);
}

/** Old log entries and old classmate nudges go (auth.sweep, hourly). */
export async function sweepPush(ctx: MutationCtx, now: number) {
  for (const l of await ctx.db.query("pushLog").withIndex("by_at", i => i.lt("at", now - LOG_KEEP)).take(500)) await ctx.db.delete(l._id);
  for (const n of await ctx.db.query("nudges").withIndex("by_at", i => i.lt("at", now - NUDGE_KEEP)).take(500)) await ctx.db.delete(n._id);
}
