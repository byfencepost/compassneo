import { v, type Infer } from "convex/values";
import { vOnCompleteArgs } from "@convex-dev/workpool";
import { internalMutation, internalQuery, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getNews, type CompassSession } from "@compassneo/compass";
import schema from "./schema";
import { aiPool } from "./pools";
import { notify, told, type Push } from "./push";
import { hashToken } from "./lib/crypto";
import { fileLink } from "./lib/links";
import { parsePlan, type PlanBlock } from "./lib/plan";
import { addDays, dayOf, schoolToday } from "./lib/days";
import { assembliesOn, noticesFor, postedOf, type DayAssembly } from "./lib/assemblies";
import { listedIn, NEW_ROW_SLACK, newsKey, newsPush, TELL_WITHIN } from "./lib/news";
import { accountFor, compassRow, periodsOf, type StoredLesson } from "./timetable";

/**
 * Announcements: the school's news feed (its daily notices among it), read with Claude into bullet points, with the
 * assemblies they announce laid over the timetable (lib/assemblies.ts, at read time).
 *
 * Each sync's news step fetches the feed the student sees (packages/compass/src/news.ts) and keeps two things: the
 * student's own "news" row in compassCache (which items they see), and one school-wide row per item in the
 * announcements table, so a school's hundreds of students cause one read per item, not hundreds. An item posted in the
 * last READ_WITHIN_DAYS that is new, or whose words changed, is queued in aiPool (convex/pools.ts) to be read by
 * convex/ai.ts; the queueing happens in the same mutation that sees the item, with a lease on the row, so two syncs at
 * one school racing each other queue it once. Without ANTHROPIC_API_KEY nothing is queued: items are kept "skipped"
 * and the app shows their text instead of bullets, until a sync after the key is set.
 *
 * The day's notices and important announcements are pushed to the students who see them (kind "notices", key
 * news:<itemId>; which items and what words is lib/news.ts). Two things tell them, each only students with a phone that
 * wants notices:
 *   the item becoming ready  its read landing (or failing, or being skipped as it arrives) tells everyone at the school
 *                            whose news row lists it, a page of accounts at a time (tellSchool)
 *   a student's own sync     tells them what is ready in their feed and not told yet: an item their row lists only
 *                            from this sync on, and one whose read has kept it waiting past READ_WAIT
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** Items asked of Compass per sync. */
const NEWS_LIMIT = 30;
/** Only items posted this recently are read: older ones are kept as they are. */
const READ_WITHIN_DAYS = 10;
/** Text kept per item: enough for a long bulletin, and a bound on what one read costs. */
const MAX_TEXT = 12_000;
/** How long a queued read holds its item before a later sync may queue it again (it died without a word). */
const LEASE = 30 * MINUTE;
/** A read that failed through every retry (the API down, the key refused) is tried again after this. */
const RETRY_AFTER = 6 * HOUR;
/** After the paged news feed fails, it is asked again only after this (Feed.svc answers meanwhile). */
const PAGED_AGAIN = 24 * HOUR;
/** Notices shown on home: the last three weeks. */
const LIST_DAYS = 21;
/** Text sent to the app per notice, for the ones not read yet (and "Show the notice"). */
const LIST_TEXT = 4_000;

const itemV = v.object({
  id: v.string(),
  title: v.string(),
  by: v.union(v.string(), v.null()),
  at: v.union(v.string(), v.null()),
  text: v.string(),
  important: v.boolean(),
  attachments: v.array(v.string()),
  files: v.array(v.object({ name: v.string(), path: v.union(v.string(), v.null()), url: v.union(v.string(), v.null()) })),
  blocks: schema.tables.announcements.validator.fields.blocks,
  hash: v.string(),
});
type Item = Infer<typeof itemV>;

const cut = (s: string, max = 300) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// ---------- the sync's step ----------

/**
 * The sync's news step (convex/sync.ts): fetches the feed, keeps it and queues the new items to be read. The count is
 * the items the student sees; the note says which call answered and the field names its items had (Compass's feed
 * shapes are guessed, so a real sync is how they are learned).
 */
export async function fetchNews(ctx: ActionCtx, account: Doc<"accounts">, s: CompassSession): Promise<{ count?: number; note?: string }> {
  // Where the feed came from last time: a school whose paged feed failed is not asked it again for a day.
  const last = (await ctx.runQuery(internal.cache.get, { accountId: account._id, store: "compass", kind: "news" }))?.data as
    | { source?: string; pagedAt?: number; fields?: string[] }
    | null
    | undefined;
  const paged = last?.source !== "feed" || !last.pagedAt || Date.now() - last.pagedAt > PAGED_AGAIN;
  const feed = await getNews(s, { limit: NEWS_LIMIT, paged });
  const items: Item[] = await Promise.all(
    feed.items.map(async i => {
      const title = cut(i.title, 300);
      const text = i.text.slice(0, MAX_TEXT);
      return {
        id: i.id.slice(0, 200),
        title,
        by: i.by && cut(i.by, 120),
        at: i.at,
        text,
        // The original's look, made here once per sync rather than by every query that shows it.
        blocks: i.html ? parsePlan(i.html) : undefined,
        important: i.important,
        attachments: i.attachments.map(a => cut(a.name, 160)),
        // A path or link too long to be a real one is dropped rather than cut (a cut one would point nowhere).
        files: i.attachments.map(a => ({
          name: cut(a.name, 160),
          path: a.path && a.path.length <= 600 ? a.path : null,
          url: a.url && a.url.length <= 1000 ? a.url : null,
        })),
        hash: await hashToken(`${title}\n${text}`),
      };
    }),
  );
  const r = await ctx.runMutation(internal.announcements.take, {
    accountId: account._id,
    slug: account.slug,
    source: feed.source,
    fields: feed.fields,
    textFields: feed.textFields,
    problem: feed.problem,
    // Only while the paged feed is held off (the plain feed answered instead): a time kept on every sync would make the
    // row new each time, and run every query reading it again.
    pagedAt: feed.source === "feed" ? (paged ? Date.now() : last?.pagedAt) : undefined,
    items,
  });
  // Everything learned about the feed's shape, in the logs in full when it is new (the step's note is cut at 200
  // characters, and the step runs every minute while the app is open).
  if (last?.source !== feed.source || JSON.stringify(last.fields) !== JSON.stringify(feed.fields)) console.log(`news ${account.slug}: ${JSON.stringify({ source: feed.source, problem: feed.problem, textFields: feed.textFields, fields: feed.fields })}`);
  const where = feed.source === "newsfeed" ? "NewsFeed.svc" : "Feed.svc";
  const words = feed.textFields.length ? `text in ${feed.textFields.join("+")}` : "no text field";
  const note = [`${where}, ${words}`, r.queued ? `${r.queued} to read` : null, `fields: ${feed.fields.join(", ")}`, feed.problem]
    .filter(Boolean)
    .join("; ");
  return { count: items.length, note };
}

type Decision = "read" | { skipped: "no-key" | "old" | "empty" } | null;

/** What to do with an item a sync has just seen: read it, keep it unread (and why), or leave it be. */
function decide(row: Doc<"announcements"> | null, item: Item, recent: boolean, keyed: boolean, now: number): Decision {
  const changed = !row || row.hash !== item.hash;
  // A title alone can say enough ("Year 9 assembly moved to period 4"); a bare "Notice" cannot.
  const empty = !item.text.trim() && item.title.split(/\s+/).length < 4;
  if (changed) {
    if (empty) return { skipped: "empty" };
    if (!recent) return { skipped: "old" };
    return keyed ? "read" : { skipped: "no-key" };
  }
  if (!recent || !keyed) return null;
  if (row.status === "skipped" && row.skipped === "no-key") return "read";
  if (row.status === "pending" && (row.leaseUntil ?? 0) <= now) return "read";
  if (row.status === "failed" && row.nextTryAt != null && row.nextTryAt <= now) return "read";
  return null;
}

const SKIP_REASON = {
  "no-key": "ANTHROPIC_API_KEY is not set on this deployment.",
  old: `Posted more than ${READ_WITHIN_DAYS} days before it was first seen.`,
  empty: "Nothing to read.",
} as const;

/**
 * Keeps what a sync fetched: the student's news row, and each item school-wide, queueing the ones to read. One
 * transaction, so the lease it writes is seen by every other sync at the school before it decides.
 */
export const take = internalMutation({
  args: {
    accountId: v.id("accounts"),
    slug: v.string(),
    source: v.string(),
    fields: v.array(v.string()),
    textFields: v.array(v.string()),
    problem: v.union(v.string(), v.null()),
    /** When the paged news feed was last asked. */
    pagedAt: v.optional(v.number()),
    items: v.array(itemV),
  },
  handler: async (ctx, a): Promise<{ queued: number }> => {
    if (!(await ctx.db.get(a.accountId))) return { queued: 0 };
    const now = Date.now();
    const keyed = !!process.env.ANTHROPIC_API_KEY;
    const today = schoolToday(a.slug);
    const oldest = addDays(today, -READ_WITHIN_DAYS);
    let queued = 0;
    /** Today's items, new at the school: maybe news to tell (lib/news.ts decides, below). ready: settled as it arrived. */
    const fresh: Array<{ id: Id<"announcements">; ready: boolean }> = [];

    for (const item of a.items) {
      const row = await ctx.db
        .query("announcements")
        .withIndex("by_slug_item", q => q.eq("slug", a.slug).eq("itemId", item.id))
        .unique();
      // An item with no date counts by when it was first seen.
      const posted = item.at ?? (row ? new Date(row.firstSeenAt).toISOString() : new Date(now).toISOString());
      const recent = dayOf(posted, a.slug) >= oldest;
      const decision = decide(row, item, recent, keyed, now);
      const changed = !row || row.hash !== item.hash;

      const words = {
        title: item.title,
        by: item.by ?? undefined,
        postedAt: item.at ?? undefined,
        important: item.important,
        attachments: item.attachments,
        files: item.files,
        text: item.text,
        blocks: item.blocks,
        hash: item.hash,
      };
      // Where the files are, and the original's blocks, are kept up to date without counting as an edit: they change
      // nothing Claude read. (Rows kept before either existed get them on the next sync.)
      const filesMoved =
        !!row && (JSON.stringify(row.files ?? null) !== JSON.stringify(item.files) || (!row.blocks && !!item.blocks?.length));
      const state =
        decision === "read"
          ? { status: "pending" as const, skipped: undefined, error: undefined, nextTryAt: undefined, leaseUntil: now + LEASE }
          : decision
            ? { status: "skipped" as const, skipped: decision.skipped, error: SKIP_REASON[decision.skipped], nextTryAt: undefined, leaseUntil: undefined }
            : {};
      // Changed words make the last reading stale, unless it is being read again (then it stands until the new one lands).
      const stale = changed && decision !== "read" ? { parsed: undefined, parsedHash: undefined, parsedAt: undefined, model: undefined } : {};

      let id: Id<"announcements">;
      if (!row) {
        id = await ctx.db.insert("announcements", {
          slug: a.slug,
          itemId: item.id,
          ...words,
          firstSeenAt: now,
          seenAt: now,
          status: "skipped",
          ...state,
        });
      } else {
        id = row._id;
        // Nothing else is written: the item is shared by everyone at the school, and every one of their timetables reads
        // it (lib/assemblies.ts noticesFor), so a write runs them all again.
        if (changed || decision || filesMoved) await ctx.db.patch(id, { ...words, seenAt: now, ...state, ...stale });
      }

      if (decision === "read") {
        const workId = await aiPool.enqueueAction(
          ctx,
          internal.ai.read,
          { id, hash: item.hash },
          { onComplete: internal.announcements.settled, context: { id, hash: item.hash } },
        );
        await ctx.db.patch(id, { workId });
        queued++;
      }
      if (dayOf(posted, a.slug) === today && now - (row?.firstSeenAt ?? now) <= TELL_WITHIN) fresh.push({ id, ready: changed && !!decision && decision !== "read" });
    }

    // The student's own row: which items they see, newest first, and what the feed looked like.
    const data = {
      source: a.source,
      fields: a.fields,
      textFields: a.textFields,
      problem: a.problem,
      pagedAt: a.pagedAt,
      items: a.items.map(i => ({ id: i.id, at: i.at })),
    };
    const news = await ctx.db
      .query("compassCache")
      .withIndex("by_account_kind", i => i.eq("accountId", a.accountId).eq("kind", "news"))
      .unique();

    // This student is told what in their feed is ready to tell (their first sync tells them nothing: it is all backlog
    // to them), and an item that is ready as it arrives (skipped, not read) is told to the rest of the school.
    if (fresh.length) {
      let wants: boolean | undefined;
      for (const f of fresh) {
        const n = await ctx.db.get(f.id);
        const push = n && newsPush(n, now);
        if (!n || !push) continue;
        if (news && (wants ??= await wantsNotices(ctx, a.accountId))) await tellStudent(ctx, a.accountId, n, push, news._creationTime);
        if (f.ready) await ctx.scheduler.runAfter(0, internal.announcements.tellSchool, { id: f.id });
      }
    }

    if (!news) await ctx.db.insert("compassCache", { accountId: a.accountId, kind: "news", data, fetchedAt: now });
    else await ctx.db.patch(news._id, JSON.stringify(news.data) === JSON.stringify(data) ? { fetchedAt: now } : { data, fetchedAt: now });
    return { queued };
  },
});

// ---------- the read (convex/ai.ts) ----------

export const forRead = internalQuery({
  args: { id: v.id("announcements") },
  handler: (ctx, { id }) => ctx.db.get(id),
});

/** What a read came to. Written only if the item still has the words that were read. */
export const save = internalMutation({
  args: {
    id: v.id("announcements"),
    hash: v.string(),
    outcome: v.union(
      v.object({ status: v.literal("done"), parsed: schema.tables.announcements.validator.fields.parsed, model: v.string() }),
      v.object({ status: v.literal("failed"), error: v.string(), retry: v.boolean() }),
      v.object({ status: v.literal("skipped"), error: v.string() }),
    ),
  },
  handler: async (ctx, { id, hash, outcome }) => {
    const row = await ctx.db.get(id);
    if (!row || row.hash !== hash) return;
    const now = Date.now();
    const settled = { leaseUntil: undefined, workId: undefined };
    if (outcome.status === "done") {
      await ctx.db.patch(id, {
        ...settled,
        status: "done",
        parsed: outcome.parsed,
        model: outcome.model,
        parsedAt: now,
        parsedHash: hash,
        error: undefined,
        skipped: undefined,
        nextTryAt: undefined,
      });
    } else if (outcome.status === "failed") {
      await ctx.db.patch(id, {
        ...settled,
        status: "failed",
        error: cut(outcome.error),
        nextTryAt: outcome.retry ? now + RETRY_AFTER : undefined,
        parsed: undefined,
        parsedHash: undefined,
      });
    } else {
      await ctx.db.patch(id, { ...settled, status: "skipped", skipped: "no-key", error: cut(outcome.error) });
    }
    await whenReady(ctx, id);
  },
});

/**
 * The pool's word on a read. The read writes its own outcome (save), so this only acts when it never could: every
 * attempt threw (the API down or rate limited throughout) or the work was cancelled. Then the item is failed, to be
 * tried again after RETRY_AFTER.
 */
export const settled = internalMutation({
  args: vOnCompleteArgs(v.object({ id: v.id("announcements"), hash: v.string() })),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "success") return;
    const row = await ctx.db.get(context.id);
    if (!row || row.hash !== context.hash || row.status !== "pending") return;
    await ctx.db.patch(row._id, {
      status: "failed",
      error: result.kind === "failed" ? cut(result.error) : "The read was cancelled.",
      nextTryAt: Date.now() + RETRY_AFTER,
      leaseUntil: undefined,
      workId: undefined,
      parsed: undefined,
      parsedHash: undefined,
    });
    await whenReady(ctx, row._id);
  },
});

// ---------- telling (lib/news.ts) ----------

/** Accounts looked at per mutation as a school is told; more chain on in mutations of their own. */
const TELL_BATCH = 50;

/** A read just settled: if that makes the item news to tell, the school is told. */
async function whenReady(ctx: MutationCtx, id: Id<"announcements">) {
  const n = await ctx.db.get(id);
  if (n && newsPush(n, Date.now())) await ctx.scheduler.runAfter(0, internal.announcements.tellSchool, { id });
}

const wantsNotices = async (ctx: QueryCtx, accountId: Id<"accounts">) =>
  (await ctx.db.query("pushDevices").withIndex("by_account", i => i.eq("accountId", accountId)).collect()).some(d => d.prefs.notices);

/**
 * Tells one student about an item they see, once (notify), when it is news to them: their news row was made (`since`)
 * before the school first saw the item. How many a day is push.ts's budget (notify), shared with everything else.
 */
async function tellStudent(ctx: MutationCtx, accountId: Id<"accounts">, n: Doc<"announcements">, push: Push, since: number) {
  if (since + NEW_ROW_SLACK > n.firstSeenAt) return false;
  const key = newsKey(n.itemId);
  if (await told(ctx, accountId, key)) return false;
  return notify(ctx, accountId, key, push);
}

/**
 * Tells everyone at an item's school who sees it and wants notices, a page of accounts at a time. Asked for when the
 * item becomes ready to tell; whether it still is is asked again on every page (lib/news.ts newsPush).
 */
export const tellSchool = internalMutation({
  args: { id: v.id("announcements"), cursor: v.optional(v.string()) },
  handler: async (ctx, { id, cursor }) => {
    const now = Date.now();
    const n = await ctx.db.get(id);
    const push = n && newsPush(n, now);
    if (!n || !push) return;
    const page = await ctx.db
      .query("accounts")
      .withIndex("by_slug", i => i.eq("slug", n.slug))
      .paginate({ numItems: TELL_BATCH, cursor: cursor ?? null });
    for (const account of page.page) {
      if (!(await wantsNotices(ctx, account._id))) continue;
      const news = await compassRow(ctx, account._id, "news");
      if (news && listedIn(news.data, n.itemId)) await tellStudent(ctx, account._id, n, push, news._creationTime);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.announcements.tellSchool, { id, cursor: page.continueCursor });
  },
});

// ---------- reading ----------

export type Notice = {
  id: string;
  title: string;
  by: string | null;
  /** When it was posted (ISO), else when a sync first saw it. */
  at: string;
  important: boolean;
  /**
   * The files attached to it: href a Compass Neo file link (opens in the viewer) or a web link (external), null when the
   * item named a file without saying where it is.
   */
  attachments: Array<{ name: string; href: string | null; external: boolean }>;
  /** pending: queued to be read. done: summary and bullets are Claude's. failed or skipped: show the text. */
  status: Doc<"announcements">["status"];
  kind: "daily-notices" | "announcement" | "other" | null;
  summary: string | null;
  /** Null until it has been read. */
  bullets: string[] | null;
  /** The notice's own words, capped. */
  text: string;
  /** The notice as it was written, as plain blocks to draw (lib/plan.ts); null for items kept before it was. */
  blocks: PlanBlock[] | null;
  /** How many assemblies Claude found in it. */
  assemblies: number;
};

export type UpcomingAssembly = DayAssembly & { date: string };

/** An item's files as the app opens them: a signed link to the file route for a file on Compass, else the web link. */
async function filesOf(accountId: Id<"accounts">, n: Doc<"announcements">): Promise<Notice["attachments"]> {
  if (!n.files) return n.attachments.map(name => ({ name, href: null, external: false }));
  const out: Notice["attachments"] = [];
  for (const f of n.files) {
    if (f.path) out.push({ name: f.name, href: await fileLink(accountId, "compass", f.path, f.name), external: false });
    else out.push({ name: f.name, href: f.url, external: !!f.url });
  }
  return out;
}

/**
 * The notices the student sees from the last three weeks, newest first, and the assemblies to come that are for them
 * (today's included), with times from their timetable where the notice names only periods. Null when signed out or
 * before the first sync has fetched the feed.
 */
export const list = query({
  args: { token: v.union(v.string(), v.null()) },
  handler: async (ctx, { token }): Promise<{ fetchedAt: number; notices: Notice[]; assemblies: UpcomingAssembly[] } | null> => {
    if (!token) return null;
    const account = await accountFor(ctx, token);
    if (!account) return null;
    const news = await compassRow(ctx, account._id, "news");
    if (!news) return null;
    const today = schoolToday(account.slug);
    const rows = await noticesFor(ctx, account, addDays(today, -LIST_DAYS), addDays(today, 1));

    const notices: Notice[] = [];
    for (const n of rows) notices.push({
      id: n.itemId,
      title: n.title,
      by: n.by ?? null,
      at: postedOf(n),
      important: n.important,
      attachments: await filesOf(account._id, n),
      status: n.status,
      kind: n.parsed?.kind ?? null,
      summary: n.parsed?.summary ?? null,
      bullets: n.parsed ? n.parsed.bullets : null,
      text: n.text.slice(0, LIST_TEXT),
      blocks: n.blocks ?? null,
      assemblies: n.parsed?.assemblies.length ?? 0,
    });

    // Assemblies from today on, each day laid against the student's own lessons that day (for times by period).
    const dates = [...new Set(rows.flatMap(n => (n.parsed?.assemblies ?? []).map(a => a.date)).filter(d => d >= today))].sort().slice(0, 14);
    const assemblies: UpcomingAssembly[] = [];
    for (const date of dates) {
      const items = ((await compassRow(ctx, account._id, `day:${date}`))?.data ?? []) as StoredLesson[];
      const periods = periodsOf(items);
      const lessons = items.filter(l => l.isClass && !l.allDay).map(l => ({ start: l.start, finish: l.finish, period: periods.get(l.id) ?? null }));
      for (const a of assembliesOn(date, rows, account, lessons)) assemblies.push({ ...a, date });
    }
    return { fetchedAt: news.fetchedAt, notices, assemblies };
  },
});
