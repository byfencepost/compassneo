import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assetPath, CompassError, getClassResources, type CompassResource } from "@compassneo/compass";
import { getContent, type ContentNode } from "@compassneo/connect";
import { deviceAccount, withCompass, type Problem } from "./lib/compass";
import { withConnect } from "./lib/connect";
import { fileLink } from "./lib/links";
import { parsePlan, type PlanBlock } from "./lib/plan";
import { classTarget, type ClassTarget } from "./lib/target";
import { addDays, schoolToday } from "./lib/days";
import { accountFor, fetchDays } from "./timetable";
import { readRow, sideOf, type Side } from "./cache";

/**
 * A class's resources from both sides, as one tree each: Compass's Resources (the class's folders of files, links and
 * pages) and Connect's Learning Content (sections of files and links). Fetched when the class panel's Resources tab
 * opens (load), kept per class, and asked for again after FRESH.
 *
 * Files are links to Compass Neo's own file route (lib/links.ts), so they open with the account's session.
 */

const FRESH = 3 * 3600 * 1000;

export type ResourceNode = {
  key: string;
  name: string;
  kind: "folder" | "file" | "link" | "page" | "submission" | "discussion";
  source: "compass" | "connect";
  /** A file: Compass Neo's link to it. A link: where it goes (external). */
  href: string | null;
  external: boolean;
  fileName: string | null;
  mime: string | null;
  size: number | null;
  by: string | null;
  at: string | null;
  /** A Compass page (a lesson plan, a page a teacher wrote): its text comes from resources.page. */
  page: { fileAssetId: string; nodeId: number } | null;
  /** Compass's folder of lesson plans, which every class has and is mostly empty pages. */
  lessonPlans?: true;
  children: ResourceNode[];
};

export type ClassResources = {
  compass: Side<ResourceNode[]>;
  connect: Side<ResourceNode[]>;
  /** The Connect class the content came from. */
  connectClass: { name: string; code: string | null } | null;
};

const compassKind = (id: number) => `resources:${id}`;
const connectKind = (id: number) => `content:${id}`;

async function fromCompass(accountId: Id<"accounts">, nodes: CompassResource[]): Promise<ResourceNode[]> {
  const out: ResourceNode[] = [];
  for (const n of nodes) {
    const file = n.kind === "file" && n.fileAssetId;
    out.push({
      key: `compass:${n.id}`,
      name: n.name,
      kind: n.kind,
      source: "compass",
      href: file ? await fileLink(accountId, "compass", assetPath(n.fileAssetId!, n.id), n.filename ?? n.name) : n.kind === "link" ? n.url : null,
      external: n.kind === "link",
      fileName: n.filename,
      mime: null,
      size: null,
      by: n.by,
      at: null,
      page: n.kind === "page" && n.fileAssetId ? { fileAssetId: n.fileAssetId, nodeId: n.id } : null,
      ...(n.lessonPlans ? { lessonPlans: true as const } : {}),
      children: await fromCompass(accountId, n.children),
    });
  }
  return out;
}

async function fromConnect(accountId: Id<"accounts">, nodes: ContentNode[]): Promise<ResourceNode[]> {
  const out: ResourceNode[] = [];
  for (const n of nodes) {
    if (n.kind === "other") continue;
    out.push({
      key: `connect:${n.id}`,
      name: n.name,
      kind: n.kind,
      source: "connect",
      href: n.file ? await fileLink(accountId, "connect", n.file.path, n.file.name) : n.kind === "link" ? n.url : null,
      external: n.kind === "link",
      fileName: n.file?.name ?? null,
      mime: n.file?.mime ?? null,
      size: n.file?.size ?? null,
      by: null,
      at: n.at,
      page: null,
      children: await fromConnect(accountId, n.children),
    });
  }
  return out;
}

/** Both sides' resources for a class, as last fetched. Reactive: a load lands here by itself. */
export const forClass = query({
  args: { token: v.union(v.string(), v.null()), code: v.string() },
  handler: async (ctx, { token, code }): Promise<ClassResources | null> => {
    if (!token || !code) return null;
    const account = await accountFor(ctx, token);
    if (!account) return null;
    const t = await classTarget(ctx, account, code);

    let compass: Side<ResourceNode[]> = { status: "missing" };
    if (t.activityId) {
      const row = await readRow(ctx, account._id, "compass", compassKind(t.activityId));
      const side = sideOf(row, d => d as CompassResource[]);
      compass = side.status === "ready" ? { ...side, data: await fromCompass(account._id, side.data) } : side;
    }
    let connect: Side<ResourceNode[]> = { status: "none" };
    if (t.connect) {
      const row = await readRow(ctx, account._id, "connect", connectKind(t.connect.classId));
      const side = sideOf(row, d => d as ContentNode[]);
      connect = side.status === "ready" ? { ...side, data: await fromConnect(account._id, side.data) } : side;
    }
    return { compass, connect, connectClass: t.connect && { name: t.connect.name, code: t.connect.code } };
  },
});

export const target = internalQuery({
  args: { accountId: v.id("accounts"), code: v.string() },
  handler: async (ctx, { accountId, code }): Promise<ClassTarget | null> => {
    const account = await ctx.db.get(accountId);
    return account && classTarget(ctx, account, code);
  },
});

/**
 * Fetches a class's resources from Compass and Connect, unless they were fetched in the last FRESH (force: the app's
 * refresh). A class whose Compass id is not known yet (kept before it was) has the timetable fetched again first.
 */
export const load = action({
  args: { token: v.string(), code: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { token, code, force }): Promise<{ ok: true } | Problem> => {
    const account = await deviceAccount(ctx, token);
    if (!account) return { ok: false, code: "signed-out", message: "This device is signed out." };
    let t = await ctx.runQuery(internal.resources.target, { accountId: account._id, code });
    if (!t) return { ok: false, code: "signed-out", message: "This device is signed out." };
    const now = Date.now();
    const stale = async (store: "compass" | "connect", kind: string) => {
      if (force) return true;
      const row = await ctx.runQuery(internal.cache.get, { accountId: account._id, store, kind });
      return !row || now - row.checkedAt > FRESH;
    };

    if (!t.activityId) {
      const today = schoolToday(account.slug);
      await withCompass(ctx, account, s => fetchDays(ctx, account, s, addDays(today, -7), addDays(today, 14)));
      t = (await ctx.runQuery(internal.resources.target, { accountId: account._id, code })) ?? t;
    }

    const jobs: Array<Promise<unknown>> = [];
    if (t.activityId && (await stale("compass", compassKind(t.activityId)))) {
      const activityId = t.activityId;
      jobs.push(
        withCompass(ctx, account, s => getClassResources(s, activityId)).then(r =>
          ctx.runMutation(internal.cache.put, {
            accountId: account._id,
            store: "compass",
            kind: compassKind(activityId),
            ...(r.ok ? { data: r.value } : { error: r.message }),
          }),
        ),
      );
    }
    if (t.connect && (await stale("connect", connectKind(t.connect.classId)))) {
      const classId = t.connect.classId;
      jobs.push(
        withConnect(ctx, account, c => getContent(c, classId)).then(r =>
          ctx.runMutation(internal.cache.put, {
            accountId: account._id,
            store: "connect",
            kind: connectKind(classId),
            ...(r.ok ? { data: r.value } : { error: r.message }),
          }),
        ),
      );
    }
    await Promise.all(jobs);
    return { ok: true };
  },
});

/** A Compass page (a lesson plan, a page a teacher wrote), as plain blocks. */
export const page = action({
  args: { token: v.string(), fileAssetId: v.string(), nodeId: v.number() },
  handler: async (ctx, { token, fileAssetId, nodeId }): Promise<{ ok: true; blocks: PlanBlock[] } | Problem> => {
    const account = await deviceAccount(ctx, token);
    if (!account) return { ok: false, code: "signed-out", message: "This device is signed out." };
    if (!/^[\w-]{8,80}$/.test(fileAssetId)) return { ok: false, code: "unavailable", message: "That is not a Compass page." };
    const r = await withCompass(ctx, account, async s => {
      try {
        const f = await s.file(assetPath(fileAssetId, nodeId));
        return f ? parsePlan(new TextDecoder().decode(f.bytes)) : [];
      } catch (e) {
        if (e instanceof CompassError && e.code === "expired") throw e;
        return [];
      }
    });
    return r.ok ? { ok: true, blocks: r.value } : r;
  },
});

