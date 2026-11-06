import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ConnectNotice, SubjectGrade } from "@compassneo/connect";
import { notify, told } from "./push";
import { begin } from "./sync";
import { compassRow, connectRow, peopleFor, type StoredLesson } from "./timetable";
import { readRow } from "./cache";
import { gradeSource } from "./lib/grades";
import { schoolToday } from "./lib/days";
import { instantAt } from "./lib/assemblies";
import { briefMoment, changesLine, LAST_CALL, MORNING_FROM, MORNING_TO, someMorning, STALE } from "./lib/brief";

/**
 * The morning brief: about an hour before a student's first class, a notification of today's relief teachers and room
 * changes ("Changes today", kind "changes"), told once a school day (key brief:YYYY-MM-DD). When it is due and what it
 * says is lib/brief.ts; this is the looking.
 *
 * Every five minutes (crons.ts), while it is morning at some school, `tick` goes through the phones that want changes
 * (pushDevices, a page at a time, never every account), and for each of their accounts that has not been told today
 * reads today's kept lessons ("day:YYYY-MM-DD", convex/timetable.ts):
 *   T-75 to T-65  a timetable last fetched over STALE ago asks for a background sync (convex/sync.ts `begin`, whose own
 *                 rules keep it to one run at a time), so the brief reads what Compass says this morning
 *   T-60 to T     any relief or room change is told at once; none, and nothing is logged, so a later look (every five
 *                 minutes until the first class starts) still tells one posted late. A timetable still stale here is
 *                 waited on until LAST_CALL, then told as it is
 * Nothing outside a school's morning reads a day, and nothing at all runs while it is morning at no school.
 */

/** Phones looked at per mutation; more chain on in mutations of their own. */
const PAGE = 100;

export const tick = internalMutation({
  args: { cursor: v.optional(v.string()), after: v.optional(v.id("accounts")) },
  handler: async (ctx, { cursor, after }) => {
    const now = Date.now();
    if (!cursor && !someMorning(now)) return;
    const page = await ctx.db.query("pushDevices").withIndex("by_account").paginate({ numItems: PAGE, cursor: cursor ?? null });
    // A page ordered by account: an account's phones are together, and one split across two pages is looked at once.
    const accounts = [...new Set(page.page.filter(d => d.prefs.changes).map(d => d.accountId))].filter(id => id !== after);
    for (const id of accounts) await briefFor(ctx, id, now);
    if (!page.isDone) {
      const last = page.page[page.page.length - 1]?.accountId;
      await ctx.scheduler.runAfter(0, internal.brief.tick, {
        cursor: page.continueCursor,
        after: last && accounts.includes(last) ? last : undefined,
      });
    }
  },
});

/** One account's look: asks for a fresh timetable, tells the changes, or does nothing, by where today is (lib/brief.ts). */
async function briefFor(ctx: MutationCtx, accountId: Id<"accounts">, now: number) {
  const account = await ctx.db.get(accountId);
  if (!account) return;
  const today = schoolToday(account.slug);
  // Only in the school's own morning is a day worth reading.
  const from = instantAt(today, MORNING_FROM, account.slug);
  const to = instantAt(today, MORNING_TO, account.slug);
  if (!from || !to || now < Date.parse(from) || now >= Date.parse(to)) return;
  const key = `brief:${today}`;
  if (await told(ctx, accountId, key)) return;

  const items = ((await compassRow(ctx, accountId, `day:${today}`))?.data ?? []) as StoredLesson[];
  const moment = briefMoment(items, now);
  if (moment.phase === "off" || moment.phase === "early") return;
  if (moment.phase === "tell" && !moment.changed.length) return;

  // When the timetable last came back from Compass, in any run (a quick one fetches it too).
  const checked: number = await ctx.runQuery(internal.sync.checkedAt, { accountId, step: "compass:timetable" });
  const stale = now - checked > STALE;
  if (moment.phase === "ask") {
    if (stale) await begin(ctx, account, "background", false, now);
    return;
  }
  if (stale && now < moment.first - LAST_CALL) return;

  // Names as the app shows them: the class's short name, each teacher by initial and surname.
  const source = gradeSource(account);
  const grades = ((source && (await readRow(ctx, accountId, source, "grades"))?.data) ?? []) as SubjectGrade[];
  const notices = ((await connectRow(ctx, accountId, "notices"))?.data ?? []) as ConnectNotice[];
  const who = await peopleFor(ctx, account.slug, grades, notices, moment.changed.flatMap(l => [l.teacher, l.cover]));
  const body = changesLine(moment.changed, who);
  if (!body) return;
  await notify(ctx, accountId, key, { kind: "changes", title: "Changes today", body, url: "/" });
}
