import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { CompassError, getFeedItems, getUserDetails, type CompassSession } from "@compassneo/compass";
import { ConnectError, type ConnectClass, type ConnectNotice, type ConnectSession } from "@compassneo/connect";
import { hashToken } from "./lib/crypto";
import { deviceAccount, withCompass, type Problem } from "./lib/compass";
import { isWA, withConnect } from "./lib/connect";
import { addDays, schoolToday } from "./lib/days";
import { fetchDays, WINDOW_AHEAD, WINDOW_BEHIND } from "./timetable";
import { syncTeachers } from "./teachers";
import { syncTasks } from "./work";
import { fetchCompassAttendance, fetchConnectAttendance } from "./attendance";
import { fetchEvents } from "./events";
import { fetchChronicle } from "./chronicle";

/**
 * Sync: one pass over everything Compass Neo keeps for an account. Compass first (profile, the timetable around today,
 * learning tasks, news), then Connect at WA schools (sign-in, classes, notices, grades). Each step is written to the
 * run as it starts and ends, so the app can draw the sync as it happens. Steps run one after another: it is a few
 * seconds either way, and Compass and Connect each get one session at a time.
 *
 * A sign-in starts a run at once. Opening the app starts one if the last finished more than FRESH ago; "Sync now"
 * always starts one.
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** Opening the app reuses a sync this recent. */
const FRESH = 20 * MINUTE;
/** A run that has not finished in this long died with its action; the next one may start. */
export const STALE_RUN = 3 * MINUTE;
/** After Connect refuses an account, it is asked again only after this long (or on "Sync now"). */
const RETRY_REFUSED = 6 * 60 * MINUTE;
/** Runs kept per account: the latest, and a few before it to see what went wrong. */
const KEEP_RUNS = 5;

// "people" (teachers' names and photos) goes last: it may be refused, and nothing waits on it.
const COMPASS_STEPS = ["profile", "timetable", "tasks", "news", "attendance", "events", "chronicle", "people"] as const;
const CONNECT_STEPS = ["signin", "classes", "notices", "grades", "attendance"] as const;
type CompassKey = (typeof COMPASS_STEPS)[number];
type ConnectKey = (typeof CONNECT_STEPS)[number];
type Reason = "sign-in" | "open" | "manual";
type Status = "waiting" | "running" | "done" | "failed" | "skipped";
type Outcome = { count?: number; note?: string };

const reasonV = v.union(v.literal("sign-in"), v.literal("open"), v.literal("manual"));
const statusV = v.union(v.literal("waiting"), v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("skipped"));

export type SyncRun = Pick<Doc<"syncs">, "_id" | "reason" | "startedAt" | "finishedAt" | "steps">;

/** The device's latest sync, as it fills in. Reactive: each step lands here as it starts and ends. */
export const latest = query({
  args: { token: v.union(v.string(), v.null()) },
  handler: async (ctx, { token }): Promise<SyncRun | null> => {
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const session = await ctx.db.query("sessions").withIndex("by_token", i => i.eq("tokenHash", tokenHash)).first();
    if (!session) return null;
    const run = await ctx.db
      .query("syncs")
      .withIndex("by_account", i => i.eq("accountId", session.accountId))
      .order("desc")
      .first();
    return run && { _id: run._id, reason: run.reason, startedAt: run.startedAt, finishedAt: run.finishedAt, steps: run.steps };
  },
});

/**
 * Syncs the device's account now, unless a sync is running or finished in the last twenty minutes (force: "Sync now").
 * Resolves when the sync is done. A stored login Compass no longer accepts comes back as password-changed, as from
 * any other call; the account is forgotten by then.
 */
export const now = action({
  args: { token: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { token, force }): Promise<{ ok: true } | Problem> => {
    const account = await deviceAccount(ctx, token);
    if (!account) return { ok: false, code: "signed-out", message: "This device is signed out." };
    const runId = await ctx.runMutation(internal.sync.begin, { accountId: account._id, reason: force ? "manual" : "open", force: !!force });
    if (!runId) return { ok: true };
    return runSync(ctx, runId, account, force ? "manual" : "open");
  },
});

/** A sync started by a sign-in, scheduled so the sign-in answers at once. */
export const run = internalAction({
  args: { runId: v.id("syncs") },
  handler: async (ctx, { runId }) => {
    const r = await ctx.runQuery(internal.sync.get, { runId });
    const account = r && (await ctx.runQuery(internal.accounts.byId, { accountId: r.accountId }));
    if (r && account) await runSync(ctx, runId, account, r.reason);
  },
});

// ---------- the steps ----------

const text = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);

const COMPASS: Record<CompassKey, (ctx: ActionCtx, account: Doc<"accounts">, s: CompassSession) => Promise<Outcome>> = {
  async profile(ctx, account, s) {
    const d = await getUserDetails(s);
    const displayName = d.preferredName || d.firstName || account.displayName;
    // The photo is copied once per photo: Compass gives a new path when it changes.
    let photo: { photoId: Id<"_storage">; photoPath: string } | undefined;
    if (d.photoPath && d.photoPath !== account.photoPath) {
      const image = await s.image(d.photoPath).catch(() => null);
      if (image) photo = { photoId: await ctx.storage.store(new Blob([image.bytes], { type: image.type })), photoPath: d.photoPath };
    }
    await ctx.runMutation(internal.accounts.saveProfile, {
      accountId: account._id,
      displayName,
      fullName: d.fullName ?? undefined,
      formGroup: d.formGroup ?? undefined,
      ...photo,
    });
    return { note: d.formGroup ? `${displayName}, ${d.formGroup}` : displayName };
  },

  /** The timetable around today, a day per row (convex/timetable.ts). The count is the lessons in it. */
  async timetable(ctx, account, s) {
    const today = schoolToday(account.slug);
    const r = await fetchDays(ctx, account, s, addDays(today, -WINDOW_BEHIND), addDays(today, WINDOW_AHEAD));
    return { count: r.lessons, note: r.teacherFields.length ? `teacher fields: ${r.teacherFields.join(", ")}` : undefined };
  },

  /** Every task, in full (instructions, attachments, what was handed in): convex/work.ts. The count is the ones to come. */
  async tasks(ctx, account, s) {
    const r = await syncTasks(ctx, account, s);
    return { count: r.upcoming };
  },

  async news(ctx, account, s) {
    const items = (await getFeedItems(s, { count: 25 })).map(f => ({
      id: f.id ?? f.itemId ?? null,
      title: text(f.title) ?? "News",
      by: text(f.userName) ?? text(f.authorName) ?? null,
      at: text(f.postDateTime) ?? text(f.createdTimestamp) ?? text(f.date) ?? null,
    }));
    await ctx.runMutation(internal.sync.keep, { accountId: account._id, kind: "news", data: items });
    return { count: items.length };
  },

  /** This year's rolls by class and days by term (convex/attendance.ts). */
  attendance: (ctx, account, s) => fetchCompassAttendance(ctx, account, s),

  /** Excursions, clubs, assemblies and exams this year and the months ahead (convex/events.ts). */
  events: (ctx, account, s) => fetchEvents(ctx, account, s),

  /** What staff have noted in Chronicle that the student may see (convex/chronicle.ts). */
  chronicle: (ctx, account, s) => fetchChronicle(ctx, account, s),

  /** The teachers on the timetable: their names and photos, once a fortnight each (convex/teachers.ts). */
  people: (ctx, account, s) => syncTeachers(ctx, account, s),
};

const failure = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

async function runSync(ctx: ActionCtx, runId: Id<"syncs">, account: Doc<"accounts">, reason: Reason): Promise<{ ok: true } | Problem> {
  const mark = (key: string, status: Status, o: Outcome = {}) => ctx.runMutation(internal.sync.step, { runId, key, status, ...o });

  // Compass: one session for every step. A step that fails on its own is marked and the rest carry on; a session
  // Compass has ended is thrown back to withCompass, which signs in again and runs the steps not done yet.
  const settled = new Set<CompassKey>();
  const compass = await withCompass(ctx, account, async s => {
    for (const key of COMPASS_STEPS) {
      if (settled.has(key)) continue;
      await mark(key, "running");
      try {
        await mark(key, "done", await COMPASS[key](ctx, account, s));
      } catch (e) {
        if (e instanceof CompassError && e.code === "expired") throw e;
        await mark(key, "failed", { note: failure(e) });
      }
      settled.add(key);
    }
  });
  if (!compass.ok) {
    // Signed out or password changed: the account (and this run) is gone already.
    if (compass.code === "signed-out" || compass.code === "password-changed") return compass;
    for (const key of COMPASS_STEPS) if (!settled.has(key)) await mark(key, "failed", { note: compass.message });
  }

  const runDoc = await ctx.runQuery(internal.sync.get, { runId });
  if (runDoc?.steps.some(s => s.source === "connect")) await runConnect(ctx, account, reason, mark);

  await ctx.runMutation(internal.sync.finish, { runId });
  return { ok: true };
}

async function runConnect(
  ctx: ActionCtx,
  account: Doc<"accounts">,
  reason: Reason,
  mark: (key: string, status: Status, o?: Outcome) => Promise<null>,
) {
  const grades = await ctx.runQuery(internal.connect.cached, { accountId: account._id, kind: "grades" });
  const refused = grades && !grades.data && grades.error && Date.now() - grades.checkedAt < RETRY_REFUSED;
  if (refused && reason !== "manual") {
    for (const key of CONNECT_STEPS) await mark(key, "skipped", { note: grades.error });
    return;
  }

  const store = (kind: string, value: { data: unknown } | { error: string }) =>
    ctx.runMutation(internal.connect.store, { accountId: account._id, kind, ...value });

  const settled = new Set<ConnectKey>();
  let classes: ConnectClass[] = [];
  const STEPS: Record<Exclude<ConnectKey, "signin">, (c: ConnectSession) => Promise<Outcome>> = {
    async classes(c) {
      classes = await c.getClasses();
      await store("classes", { data: classes });
      return { count: classes.length };
    },
    async notices(c) {
      const all: ConnectNotice[] = [];
      for (const k of classes.filter(k => !k.finished).slice(0, 8)) all.push(...(await c.getNotices(k.classId, 10)));
      const latest = all.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 40);
      await store("notices", { data: latest });
      return { count: latest.length };
    },
    async grades(c) {
      const subjects = await c.getGrades();
      await store("grades", { data: subjects });
      return { count: new Set(subjects.map(s => s.subject)).size };
    },
    attendance: c => fetchConnectAttendance(ctx, account, c),
  };

  await mark("signin", "running");
  const r = await withConnect(ctx, account, async c => {
    // withConnect has signed in (or found Connect's session still open) by the time this runs.
    if (!settled.has("signin")) {
      const me = await c.whoami();
      await mark("signin", "done", { note: me.school ?? undefined });
      settled.add("signin");
    }
    for (const key of ["classes", "notices", "grades", "attendance"] as const) {
      if (settled.has(key)) continue;
      await mark(key, "running");
      try {
        await mark(key, "done", await STEPS[key](c));
      } catch (e) {
        if (e instanceof ConnectError && e.code === "expired") throw e;
        await mark(key, "failed", { note: failure(e) });
        if (key === "grades") await store("grades", { error: grades?.data ? "Connect did not answer, so these may be out of date." : failure(e) });
      }
      settled.add(key);
    }
  });
  if (!r.ok) {
    // A refusal is shown in place of the grades; a hiccup keeps the last grades and says they could not be updated.
    await store("grades", { error: r.code === "upstream" && grades?.data ? "Connect did not answer, so these may be out of date." : r.message });
    // No sign-in: the sign-in step failed and the rest never started. Otherwise the steps left failed with it.
    const signedIn = settled.has("signin");
    for (const key of CONNECT_STEPS) {
      if (settled.has(key)) continue;
      await mark(key, signedIn || key === "signin" ? "failed" : "skipped", { note: r.message });
    }
  }
}

// ---------- internals ----------

export const get = internalQuery({
  args: { runId: v.id("syncs") },
  handler: (ctx, { runId }) => ctx.db.get(runId),
});

/** Starts a run, or returns null if one is under way or (unless force) one finished in the last FRESH. */
export const begin = internalMutation({
  args: { accountId: v.id("accounts"), reason: reasonV, force: v.boolean() },
  handler: async (ctx, { accountId, reason, force }): Promise<Id<"syncs"> | null> => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const now = Date.now();
    const runs = await ctx.db.query("syncs").withIndex("by_account", i => i.eq("accountId", accountId)).order("desc").take(KEEP_RUNS + 5);
    const last = runs[0];
    if (last && !last.finishedAt && now - last.startedAt < STALE_RUN) return null;
    if (!force && last?.finishedAt && now - last.finishedAt < FRESH) return null;

    // Connect needs the stored login to sign in (accounts from before logins were kept have none).
    const connect = isWA(account.slug) && !!account.sealedLogin;
    const steps = [
      ...COMPASS_STEPS.map(key => ({ key, source: "compass" as const, status: "waiting" as const })),
      ...(connect ? CONNECT_STEPS.map(key => ({ key, source: "connect" as const, status: "waiting" as const })) : []),
    ];
    const id = await ctx.db.insert("syncs", { accountId, reason, startedAt: now, steps });
    for (const old of runs.slice(KEEP_RUNS - 1)) await ctx.db.delete(old._id);
    return id;
  },
});

export const step = internalMutation({
  args: { runId: v.id("syncs"), key: v.string(), status: statusV, count: v.optional(v.number()), note: v.optional(v.string()) },
  handler: async (ctx, { runId, key, status, count, note }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    await ctx.db.patch(runId, {
      steps: run.steps.map(s => (s.key === key ? { key: s.key, source: s.source, status, count, note: note?.slice(0, 200), at: Date.now() } : s)),
    });
    return null;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("syncs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return;
    await ctx.db.patch(runId, {
      finishedAt: Date.now(),
      steps: run.steps.map(s => (s.status === "waiting" || s.status === "running" ? { ...s, status: "skipped" as const } : s)),
    });
  },
});

/** Keeps what a Compass step fetched, replacing the last. */
export const keep = internalMutation({
  args: { accountId: v.id("accounts"), kind: v.string(), data: v.any() },
  handler: async (ctx, { accountId, kind, data }) => {
    if (!(await ctx.db.get(accountId))) return;
    const row = await ctx.db.query("compassCache").withIndex("by_account_kind", i => i.eq("accountId", accountId).eq("kind", kind)).unique();
    if (row) await ctx.db.patch(row._id, { data, fetchedAt: Date.now() });
    else await ctx.db.insert("compassCache", { accountId, kind, data, fetchedAt: Date.now() });
  },
});
