import { v } from "convex/values";
import { action, mutation, query, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getTasks, submissionPath, assetPath, submitTask, uploadFile, type CompassTask, type CompassSession } from "@compassneo/compass";
import {
  ConnectError,
  getMySubmission,
  getSubmissions,
  handIn,
  type ConnectClass,
  type ConnectSession,
  type ConnectSubmission,
  type MySubmission,
} from "@compassneo/connect";
import { deviceAccount, withCompass, type Problem } from "./lib/compass";
import { withConnect } from "./lib/connect";
import { fileLink } from "./lib/links";
import { parsePlan, type PlanBlock } from "./lib/plan";
import { classTarget } from "./lib/target";
import { hashToken } from "./lib/crypto";
import { accountFor } from "./timetable";
import { readRow, sideOf, type Side } from "./cache";

/**
 * Work to do for a class, from both sides, and handing it in: Compass's learning tasks (instructions, attachments, the
 * slots work is handed in on, what the student has handed in) and Connect's submissions (the same, from the class's
 * submission board). Compass's come with every sync (the tasks step); Connect's are fetched when the class panel asks
 * (load), with the student's own entry on each.
 *
 * Handing in writes to Compass or Connect exactly as their own upload windows do. The file goes to Convex storage
 * first (uploadUrl), so the action can pass it on, and is deleted from storage once handed in.
 */

const FRESH = 5 * 60 * 1000;
/** Tasks kept in full: due in the last few months or later, newest first; descriptions capped, so the row stays small. */
const KEEP_DAYS = 120;
const MAX_TASKS = 160;
const MAX_DESCRIPTION = 8000;
/** A file over this is refused before upload: Compass takes up to 200 MB, but an action holds the file in memory. */
export const MAX_UPLOAD = 40 * 1024 * 1024;

export type WorkFile = { name: string; href: string | null; external: boolean; at: string | null };

export type WorkState = "todo" | "overdue" | "submitted" | "late" | "closed" | "none";

export type WorkItem = {
  key: string;
  source: "compass" | "connect";
  id: number;
  name: string;
  due: string | null;
  setAt: string | null;
  important: boolean;
  instructions: PlanBlock[];
  attachments: WorkFile[];
  state: WorkState;
  /** How Compass or Connect words the state, where it says more than the state. */
  stateText: string | null;
  handedIn: WorkFile[];
  /** Where work goes in. Compass tasks can have a few; a Connect submission has one. */
  slots: Array<{ id: number; name: string; takes: "file" | "file-or-link" | "turnitin" }>;
  canSubmit: boolean;
  /** Why it cannot be handed in here, when it cannot. */
  why: string | null;
  /** A result the teacher has released. */
  result: string | null;
  /** Connect: the teacher has left feedback or a comment. */
  feedback: boolean;
};

export type ClassWork = {
  compass: Side<WorkItem[]>;
  connect: Side<WorkItem[]>;
  connectClass: { name: string; code: string | null } | null;
};

// ---------- keeping Compass's tasks (the sync's tasks step, and load) ----------

const STATUS_CODE = { pending: 1, overdue: 2, "on-time": 3, late: 4 } as const;

/** Keeps the tasks two ways: the short list the day and class queries read ("tasks"), and in full ("taskdetail"). */
export async function storeTasks(ctx: ActionCtx, accountId: Id<"accounts">, tasks: CompassTask[]) {
  const now = Date.now();
  const since = new Date(now - 28 * 86400 * 1000).toISOString();
  const short = tasks
    .map(t => ({ id: t.id, className: t.className, name: t.name, due: t.due, status: t.me?.status ? STATUS_CODE[t.me.status] : null }))
    .filter(t => !t.due || t.due >= since)
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  await ctx.runMutation(internal.sync.keep, { accountId, kind: "tasks", data: short });

  const keepFrom = new Date(now - KEEP_DAYS * 86400 * 1000).toISOString();
  const full = tasks
    .filter(t => !t.due || t.due >= keepFrom)
    .sort((a, b) => (b.due ?? "9999").localeCompare(a.due ?? "9999"))
    .slice(0, MAX_TASKS)
    .map(t => ({ ...t, description: t.description && t.description.slice(0, MAX_DESCRIPTION) }));
  await ctx.runMutation(internal.cache.put, { accountId, store: "compass", kind: "taskdetail", data: full });
  return { upcoming: short.filter(t => t.due && t.due > new Date(now).toISOString()).length };
}

export async function syncTasks(ctx: ActionCtx, account: Doc<"accounts">, s: CompassSession) {
  return storeTasks(ctx, account._id, await getTasks(s, { limit: 300 }));
}

// ---------- where a piece of work stands ----------

const pastDue = (due: string | null, now: number) => !!due && Date.parse(due) < now;

/**
 * Where a Compass task stands for the student: Compass's own status, with a task still pending past its due date
 * overdue. A task Compass keeps no status for ("none": nothing to hand in online) reads as overdue once its date has
 * passed too, since nothing says it was done; the to-do list on home (overview.ts) leaves those out.
 */
export function compassState(t: CompassTask, now: number): WorkState {
  const status = t.me?.status ?? null;
  if (status === "on-time") return "submitted";
  if (status === "late") return "late";
  if (status === "overdue" || pastDue(t.due, now)) return "overdue";
  return status ? "todo" : "none";
}

/** Where a Connect submission stands: handed in (late or not, by the student's own entry where it was read), closed, or still to do. */
export function connectState(s: ConnectSubmission, mine: MySubmission | undefined, now: number): WorkState {
  const status = (mine?.state ?? s.mine)?.status ?? null;
  if (status && /^SUBMITTED/.test(status)) return /LATE/.test(status) ? "late" : "submitted";
  if (!s.open) return "closed";
  return pastDue(s.due, now) ? "overdue" : "todo";
}

// ---------- reading ----------

async function compassItem(accountId: Id<"accounts">, t: CompassTask, now: number): Promise<WorkItem> {
  const me = t.me;
  const handedIn: WorkFile[] = [];
  for (const x of me?.submissions ?? []) {
    handedIn.push({
      name: x.name,
      href: x.kind === "link" ? x.url : await fileLink(accountId, "compass", submissionPath(t.id, x.id), x.name),
      external: x.kind === "link",
      at: x.at,
    });
  }
  const attachments: WorkFile[] = [];
  for (const a of t.attachments) {
    attachments.push({
      name: a.name,
      href: a.url ?? (await fileLink(accountId, "compass", assetPath(a.id, a.nodeId), a.fileName ?? a.name)),
      external: !!a.url,
      at: null,
    });
  }
  const state = compassState(t, now);
  const slots = t.slots.map(s => ({ id: s.id, name: s.name, takes: s.kind === "universal" ? ("file-or-link" as const) : s.kind === "turnitin" ? ("turnitin" as const) : ("file" as const) }));
  const open = slots.filter(s => s.takes !== "turnitin");
  const canSubmit = !!me && me.canSubmit && open.length > 0;
  return {
    key: `compass:${t.id}`,
    source: "compass",
    id: t.id,
    name: t.name,
    due: t.due,
    setAt: t.createdAt,
    important: t.important,
    instructions: t.description ? parsePlan(t.description) : [],
    attachments,
    state,
    stateText: null,
    handedIn,
    slots,
    canSubmit,
    why: canSubmit
      ? null
      : !slots.length
        ? "This task has nowhere to hand work in on Compass."
        : !open.length
          ? "This task goes through Turnitin, which needs Compass itself."
          : "Compass does not take work for this task from students.",
    result: me?.result ?? null,
    feedback: false,
  };
}

/** A class's submissions row: its board, and the student's own entry on each submission read so far, by id. */
export type ConnectRow = { list: ConnectSubmission[]; mine: Record<string, MySubmission> };

async function connectItem(accountId: Id<"accounts">, s: ConnectSubmission, mine: MySubmission | undefined, now: number): Promise<WorkItem> {
  const handedIn: WorkFile[] = [];
  for (const f of mine?.files ?? []) handedIn.push({ name: f.name, href: await fileLink(accountId, "connect", f.path, f.name), external: false, at: f.at });
  const state = connectState(s, mine, now);
  const submitted = state === "submitted" || state === "late";
  const canSubmit = s.open && s.canSubmit && (!submitted || s.resubmitAllowed);
  return {
    key: `connect:${s.id}`,
    source: "connect",
    id: s.id,
    name: s.name,
    due: s.due,
    setAt: s.createdAt,
    important: false,
    instructions: s.description ? parsePlan(s.description) : [],
    attachments: [],
    state,
    stateText: (mine?.state ?? s.mine)?.display ?? null,
    handedIn,
    slots: [{ id: s.id, name: "Your work", takes: "file" }],
    canSubmit,
    why: canSubmit ? null : !s.open ? "This submission is closed." : submitted ? "Your teacher has not allowed handing this in again." : "Connect does not take work for this from you.",
    result: null,
    feedback: !!mine?.feedback?.hasComment,
  };
}

export const connectKind = (classId: number) => `submissions:${classId}`;

/** A class's work from both sides, as last fetched. Reactive. */
export const forClass = query({
  args: { token: v.union(v.string(), v.null()), code: v.string() },
  handler: async (ctx, { token, code }): Promise<ClassWork | null> => {
    if (!token || !code) return null;
    const account = await accountFor(ctx, token);
    if (!account) return null;
    const t = await classTarget(ctx, account, code);
    const now = Date.now();

    const detail = await readRow(ctx, account._id, "compass", "taskdetail");
    let compass: Side<WorkItem[]> = { status: "missing" };
    if (detail?.data) {
      const mine = (detail.data as CompassTask[]).filter(x => x.className === code);
      const items: WorkItem[] = [];
      for (const x of mine) items.push(await compassItem(account._id, x, now));
      compass = { status: "ready", fetchedAt: detail.fetchedAt ?? now, error: null, data: items };
    }

    let connect: Side<WorkItem[]> = { status: "none" };
    if (t.connect) {
      const side = sideOf(await readRow(ctx, account._id, "connect", connectKind(t.connect.classId)), d => d as ConnectRow);
      if (side.status === "ready") {
        const items: WorkItem[] = [];
        for (const x of side.data.list) items.push(await connectItem(account._id, x, side.data.mine[String(x.id)], now));
        connect = { ...side, data: items };
      } else connect = side;
    }
    return { compass, connect, connectClass: t.connect && { name: t.connect.name, code: t.connect.code } };
  },
});

// ---------- fetching ----------

/**
 * A class's submission board and the student's own entry on the submissions want picks from it (what they handed in),
 * merged with the entries kept from before: an entry not read this time keeps its last copy, and one whose submission
 * has left the board goes.
 */
async function readBoard(ctx: ActionCtx, accountId: Id<"accounts">, c: ConnectSession, classId: number, want: (list: ConnectSubmission[]) => ConnectSubmission[]) {
  const list = await getSubmissions(c, classId);
  const prior = (await ctx.runQuery(internal.cache.get, { accountId, store: "connect", kind: connectKind(classId) }))?.data as ConnectRow | null;
  const mine: Record<string, MySubmission> = { ...(prior?.mine ?? {}) };
  for (const x of want(list)) mine[String(x.id)] = await getMySubmission(c, classId, x.id);
  for (const id of Object.keys(mine)) if (!list.some(x => String(x.id) === id)) delete mine[id];
  return { list, mine } satisfies ConnectRow;
}

/** Keeps a class's board, or the reason it could not be read beside the last good one. */
const keepBoard = (ctx: ActionCtx, accountId: Id<"accounts">, classId: number, r: { data: ConnectRow } | { error: string }) =>
  ctx.runMutation(internal.cache.put, { accountId, store: "connect", kind: connectKind(classId), ...r });

/** One class's work, for the class panel (load) and after handing in (only: the one submission handed in). */
async function fetchConnect(ctx: ActionCtx, account: Doc<"accounts">, classId: number, only?: number) {
  // The student's own entry on each: the open ones and the latest few, or just the one asked.
  const want = (list: ConnectSubmission[]) => (only ? list.filter(x => x.id === only) : list.filter((x, i) => x.open || i < 10).slice(0, 20));
  const r = await withConnect(ctx, account, c => readBoard(ctx, account._id, c, classId, want));
  await keepBoard(ctx, account._id, classId, r.ok ? { data: r.value } : { error: r.message });
  return r;
}

/** The sync reads this many current classes' boards, as the notices step does, and the student's entry on this many open submissions in each. */
const SYNC_WORK_CLASSES = 8;
const SYNC_WORK_OPEN = 8;

/**
 * The sync's Connect work step (convex/sync.ts): every current class's submission board and the student's own entry
 * on the open ones, kept as each class's submissions row (the same row the class panel reads), so the to-do list on
 * home knows Connect's work without the class panel having been opened. At most SYNC_WORK_CLASSES classes and
 * SYNC_WORK_OPEN entries a class, so a run stays a few dozen requests. A class Connect will not show is kept as its
 * error and the rest carry on; a session Connect has ended goes back to withConnect, which signs in again. The count
 * is the open submissions not handed in.
 */
export async function fetchConnectWork(
  ctx: ActionCtx,
  account: Doc<"accounts">,
  c: ConnectSession,
  classes: ConnectClass[],
): Promise<{ count?: number; note?: string }> {
  const live = classes.filter(k => !k.finished).slice(0, SYNC_WORK_CLASSES);
  const now = Date.now();
  let open = 0;
  let failed = 0;
  for (const k of live) {
    try {
      const row = await readBoard(ctx, account._id, c, k.classId, list => list.filter(x => x.open).slice(0, SYNC_WORK_OPEN));
      await keepBoard(ctx, account._id, k.classId, { data: row });
      open += row.list.filter(x => {
        const s = connectState(x, row.mine[String(x.id)], now);
        return s === "todo" || s === "overdue";
      }).length;
    } catch (e) {
      if (e instanceof ConnectError && e.code === "expired") throw e;
      failed++;
      await keepBoard(ctx, account._id, k.classId, { error: e instanceof Error && e.message ? e.message : "Connect did not answer." });
    }
  }
  const note = `${live.length} ${live.length === 1 ? "class" : "classes"}${failed ? `, ${failed} did not answer` : ""}`;
  return { count: open, note };
}

/** Fetches a class's work: Compass's tasks and Connect's submissions, each unless fetched in the last few minutes. */
export const load = action({
  args: { token: v.string(), code: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { token, code, force }): Promise<{ ok: true } | Problem> => {
    const account = await deviceAccount(ctx, token);
    if (!account) return { ok: false, code: "signed-out", message: "This device is signed out." };
    const t = await ctx.runQuery(internal.resources.target, { accountId: account._id, code });
    if (!t) return { ok: false, code: "signed-out", message: "This device is signed out." };
    const now = Date.now();
    const age = async (store: "compass" | "connect", kind: string) => {
      const row = await ctx.runQuery(internal.cache.get, { accountId: account._id, store, kind });
      return row ? now - row.checkedAt : Infinity;
    };
    const jobs: Array<Promise<unknown>> = [];
    if (force || (await age("compass", "taskdetail")) > FRESH) jobs.push(withCompass(ctx, account, s => syncTasks(ctx, account, s)));
    if (t.connect && (force || (await age("connect", connectKind(t.connect.classId))) > FRESH)) jobs.push(fetchConnect(ctx, account, t.connect.classId));
    await Promise.all(jobs);
    return { ok: true };
  },
});

// ---------- handing in ----------

/** Somewhere to put the file before it is handed in. Only for a signed-in device. */
export const uploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const session = await ctx.db.query("sessions").withIndex("by_token", i => i.eq("tokenHash", tokenHash)).first();
    if (!session) throw new Error("This device is signed out.");
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Hands work in: a file (put in storage with uploadUrl first) or, on a Compass slot that takes one, a link. key is the
 * work item's ("compass:4893", "connect:6973695042"), slotId the slot it goes on.
 */
export const submit = action({
  args: {
    token: v.string(),
    code: v.string(),
    key: v.string(),
    slotId: v.number(),
    file: v.optional(v.object({ storageId: v.id("_storage"), name: v.string() })),
    url: v.optional(v.string()),
  },
  handler: async (ctx, { token, code, key, slotId, file, url }): Promise<{ ok: true } | Problem> => {
    const drop = async () => {
      if (file) await ctx.storage.delete(file.storageId).catch(() => {});
    };
    try {
      const account = await deviceAccount(ctx, token);
      if (!account) return { ok: false, code: "signed-out", message: "This device is signed out." };
      const [source, idText] = key.split(":");
      const id = Number(idText);
      if (!Number.isFinite(id) || (source !== "compass" && source !== "connect")) return { ok: false, code: "unavailable", message: "That is not a task." };
      if (!file && !url) return { ok: false, code: "unavailable", message: "Choose a file to hand in." };
      if (url && !/^https?:\/\/\S+$/i.test(url.trim())) return { ok: false, code: "unavailable", message: "That link should start with https://." };

      let blob: Blob | null = null;
      if (file) {
        blob = await ctx.storage.get(file.storageId);
        if (!blob) return { ok: false, code: "unavailable", message: "The file did not finish uploading. Try again." };
        if (blob.size > MAX_UPLOAD) return { ok: false, code: "unavailable", message: "That file is over 40 MB. Hand it in on Compass itself." };
      }
      const name = (file?.name ?? "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 150) || "work";

      if (source === "compass") {
        const tasks = ((await ctx.runQuery(internal.cache.get, { accountId: account._id, store: "compass", kind: "taskdetail" }))?.data ?? []) as CompassTask[];
        const task = tasks.find(t => t.id === id);
        const slot = task?.slots.find(s => s.id === slotId);
        if (!task?.me || !slot) return { ok: false, code: "unavailable", message: "Compass Neo does not know that task yet. Sync and try again." };
        if (slot.kind === "turnitin") return { ok: false, code: "unavailable", message: "Turnitin tasks need Compass itself." };
        if (url && slot.kind !== "universal") return { ok: false, code: "unavailable", message: "This slot takes a file, not a link." };
        const me = task.me;
        const r = await withCompass(ctx, account, async s => {
          const uploaded = blob ? await uploadFile(s, blob, name) : undefined;
          await submitTask(s, { taskStudentId: me.taskStudentId, slotId, file: uploaded, url: url?.trim() });
          await syncTasks(ctx, account, s);
        });
        if (!r.ok) return r;
        return { ok: true };
      }

      const t = await ctx.runQuery(internal.resources.target, { accountId: account._id, code });
      if (!t?.connect) return { ok: false, code: "unavailable", message: "This class is not on Connect." };
      if (!blob) return { ok: false, code: "unavailable", message: "Connect takes a file." };
      const classId = t.connect.classId;
      const r = await withConnect(ctx, account, c => handIn(c, { classId, submissionId: id, file: blob, name }));
      if (!r.ok) return r;
      await fetchConnect(ctx, account, classId, id);
      return { ok: true };
    } catch (e) {
      return { ok: false, code: "upstream", message: e instanceof Error && e.message ? e.message : "Handing it in did not work." };
    } finally {
      await drop();
    }
  },
});
