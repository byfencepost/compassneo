import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { addDays, schoolToday } from "./lib/days";
import { stateOf } from "./accounts";
import { beginAll } from "./sync";
import type { StoredClass } from "./timetable";

/**
 * Classmate checks. Every account syncs at its own minute of the quarter hour (sync.ts tick), so when a teacher lets a
 * class's marks out, each student would hear of theirs whenever their turn came round. Instead, the first sync to find
 * a new mark in a class (convex/marks.ts) asks the class's other students on Compass Neo to sync now:
 *
 *   who      classMembers: each account's current classes, kept from its timetable (keepMembers, from timetable.ts
 *            keepDays). Classmates are the other accounts at the same school with the same class code.
 *   once     one nudge per school and thing marked ("marks:10MA1:compass:4893", in `nudges`), so the classmates' own
 *            syncs finding the same mark ask nobody again, and nothing loops: a nudge only ever comes from a mark not
 *            nudged before.
 *   whom     at most MAX_WAKE classmates a nudge, and only those it would help: a stored login to sign in with, a phone
 *            that takes notifications of marks, and their own turn not about to come anyway.
 *   how      a "classmate" run each (sync.ts beginAll): full, unless one finished in the last few minutes; each
 *            started a few seconds apart, so the load on Compass stays even; behind any run already in flight, and
 *            giving way to anyone who opens the app while it waits. One whose run was in flight is asked once more a
 *            little later, in case that run was a quick one (which has no grades).
 */

/** A class not on the timetable for this long is a past one (as overview.ts and lib/courses.ts have it). */
const CURRENT_DAYS = 28;
/** Classmates one nudge wakes, at most, and members read per class to find them. */
const MAX_WAKE = 40;
const SCAN = 200;
/** A classmate whose own turn comes within this long is left to it. */
const SOON = 3 * 60 * 1000;
/** A classmate who had a run in flight is asked once more after this long. */
const RETRY_AFTER = 2 * 60 * 1000;

/**
 * The account's place in each class it takes now (timetable.ts keepDays, with the classes it keeps): a row per class
 * code seen on the timetable in the last CURRENT_DAYS, the rest dropped. Written only when something moved.
 */
export async function keepMembers(ctx: MutationCtx, account: Doc<"accounts">, classes: StoredClass[]) {
  const since = addDays(schoolToday(account.slug), -CURRENT_DAYS);
  const want = new Map(classes.filter(c => c.code && c.lastSeen >= since).map(c => [c.code, c.lastSeen]));
  for (const r of await ctx.db.query("classMembers").withIndex("by_account", i => i.eq("accountId", account._id)).collect()) {
    const lastSeen = r.slug === account.slug ? want.get(r.code) : undefined;
    if (lastSeen === undefined) {
      await ctx.db.delete(r._id);
      continue;
    }
    if (r.lastSeen !== lastSeen) await ctx.db.patch(r._id, { lastSeen });
    // A second row for the same class is deleted when it comes round.
    want.delete(r.code);
  }
  for (const [code, lastSeen] of want) await ctx.db.insert("classMembers", { slug: account.slug, code, accountId: account._id, lastSeen });
}

const membersOf = (ctx: MutationCtx, slug: string, code: string) =>
  ctx.db.query("classMembers").withIndex("by_slug_code", i => i.eq("slug", slug).eq("code", code));

/**
 * New marks found in an account's sync (marks.ts tellMarks), each with its class and what was marked: the first time
 * the school hears of each, the class's other students are asked to sync (wake, after this mutation commits). A class
 * nobody else on Compass Neo takes asks nobody.
 */
export async function nudgeClassmates(ctx: MutationCtx, account: Doc<"accounts">, found: Array<{ code: string; shared: string }>) {
  if (!found.length) return;
  const now = Date.now();
  const codes = new Set<string>();
  const alone = new Map<string, boolean>();
  for (const { code, shared } of found) {
    if (!alone.has(code)) alone.set(code, !(await membersOf(ctx, account.slug, code).take(2)).some(m => m.accountId !== account._id));
    if (alone.get(code)) continue;
    const key = `marks:${code}:${shared}`;
    if (await ctx.db.query("nudges").withIndex("by_slug_key", i => i.eq("slug", account.slug).eq("key", key)).first()) continue;
    await ctx.db.insert("nudges", { slug: account.slug, key, at: now });
    codes.add(code);
  }
  if (codes.size) await ctx.scheduler.runAfter(0, internal.classmates.wake, { slug: account.slug, codes: [...codes], from: account._id });
}

/** Whether a classmate's run now would help: it can sign in, someone would be told, and its own turn is not about to come. */
async function worthWaking(ctx: MutationCtx, a: Doc<"accounts">, now: number) {
  if (!a.sealedLogin) return false;
  const devices = await ctx.db.query("pushDevices").withIndex("by_account", i => i.eq("accountId", a._id)).take(20);
  if (!devices.some(d => d.prefs.marks)) return false;
  const next = (await stateOf(ctx, a._id))?.nextSyncAt;
  return !(next && next > 0 && next - now < SOON);
}

/** Starts the classmates' runs for a nudge: the other current members of each class, up to MAX_WAKE, in no fixed order. */
export const wake = internalMutation({
  args: { slug: v.string(), codes: v.array(v.string()), from: v.id("accounts") },
  handler: async (ctx, { slug, codes, from }) => {
    const now = Date.now();
    const since = addDays(schoolToday(slug), -CURRENT_DAYS);
    const ids = new Set<Id<"accounts">>();
    for (const code of codes) {
      for (const m of await membersOf(ctx, slug, code).take(SCAN)) if (m.accountId !== from && m.lastSeen >= since) ids.add(m.accountId);
    }
    // Shuffled, so a class with more than MAX_WAKE on Compass Neo does not wake the same ones every time.
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const accounts: Doc<"accounts">[] = [];
    for (const id of order) {
      if (accounts.length >= MAX_WAKE) break;
      const a = await ctx.db.get(id);
      if (a && a.slug === slug && (await worthWaking(ctx, a, now))) accounts.push(a);
    }
    const { busy } = await beginAll(ctx, accounts, "classmate", now);
    if (busy.length) await ctx.scheduler.runAfter(RETRY_AFTER, internal.classmates.retry, { accountIds: busy });
  },
});

/** Asks once more those whose run was in flight when they were woken. Once: no further retry. */
export const retry = internalMutation({
  args: { accountIds: v.array(v.id("accounts")) },
  handler: async (ctx, { accountIds }) => {
    const now = Date.now();
    const accounts: Doc<"accounts">[] = [];
    for (const id of accountIds.slice(0, MAX_WAKE)) {
      const a = await ctx.db.get(id);
      if (a && (await worthWaking(ctx, a, now))) accounts.push(a);
    }
    await beginAll(ctx, accounts, "classmate", now);
  },
});
