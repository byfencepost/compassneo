import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { signOutNotice } from "@/lib/session";

/**
 * One class's data, as the web's class panel reads it (apps/web/app/lib/neo/classes.ts, work.ts, resources.ts,
 * plans.ts). The detail is a plain query: the server builds it from what the sync already keeps, so there is nothing
 * to ask for. Work, resources and lesson plans are fetched from Compass, Connect and Canvas on demand: opening the
 * screen asks the server to fetch them (it skips that when it did lately), and the answer lands through the query.
 */

export type ClassDetail = NonNullable<FunctionReturnType<typeof api.classes.detail>>;
export type ClassGrades = ClassDetail["grades"];
export type ReadyGrades = Extract<ClassGrades, { status: "ready" }>;
export type SemesterGrade = NonNullable<ReadyGrades["current"]>;
export type Assessment = SemesterGrade["tasks"][number];
export type Spread = NonNullable<SemesterGrade["spread"]>;
export type ClassLesson = ClassDetail["lessons"][number];
export type ClassTask = ClassDetail["tasks"][number];
export type ClassNotice = ClassDetail["notices"][number];
export type Person = ClassDetail["teachers"][number];

export type ClassWork = NonNullable<FunctionReturnType<typeof api.work.forClass>>;
export type WorkSide = ClassWork["compass"];
export type WorkItem = Extract<WorkSide, { status: "ready" }>["data"][number];
export type WorkFile = WorkItem["handedIn"][number];
export type WorkState = WorkItem["state"];

export type ClassResources = NonNullable<FunctionReturnType<typeof api.resources.forClass>>;
export type ResourceSide = ClassResources["compass"];
export type ResourceNode = Extract<ResourceSide, { status: "ready" }>["data"][number];

export type LessonPlan = NonNullable<FunctionReturnType<typeof api.plans.forLessons>[string]>;
export type PlanBlock = LessonPlan["blocks"][number];

/** Where something came from. */
export type Source = "compass" | "connect" | "canvas";
export const SOURCE: Record<Source, string> = { compass: "Compass", connect: "Connect", canvas: "Canvas" };

/** A side as the server keeps it, without its data (for the quiet "still on its way" lines). */
export type SideState =
  | { status: "none" }
  | { status: "missing" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; fetchedAt: number; error: string | null };

type Answer = { ok: true } | { ok: false; code: string; message: string };

/** An action's answer that says this device was signed out goes to the sign-in screen's notice, as the day's loads do. */
function heard(r: Answer) {
  if (!r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
}

/**
 * When this device last asked the server to fetch something, so going back and forth between classes never asks twice
 * in a row. The server keeps its own freshness too; this only saves the round trip.
 */
const asked = new Map<string, number>();

function useLoadOnce(key: string | null, load: () => Promise<unknown>, every: number) {
  useEffect(() => {
    if (!key) return;
    const now = Date.now();
    if (now - (asked.get(key) ?? 0) < every) return;
    asked.set(key, now);
    void load().catch(() => {});
    // The key says when to ask again; load is a new function every render.
  }, [key, every]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Everything about the class, seen from a day (its semester, and the weeks of lessons around it). */
export function useClassDetail(token: string | null, code: string, day: string) {
  return useQuery(api.classes.detail, token && code ? { token, code, day } : "skip");
}

/** The class's work from every side. Opening asks for it (every couple of minutes at most); `reload` forces it. */
export function useClassWork(token: string | null, code: string) {
  const data = useQuery(api.work.forClass, token && code ? { token, code } : "skip");
  const load = useAction(api.work.load);
  useLoadOnce(token && code ? `work:${code}` : null, () => load({ token: token!, code }).then(heard), 2 * 60_000);
  const reload = useCallback(async () => {
    if (!token || !code) return;
    await load({ token, code, force: true }).then(heard, () => {});
  }, [token, code, load]);
  return { data, reload };
}

/**
 * The class's resources. Read only (fetch false), to know whether the Files tab has anything; the Files tab itself
 * asks the server to fetch them when it opens, as the web's does.
 */
export function useClassResources(token: string | null, code: string, fetch: boolean) {
  const data = useQuery(api.resources.forClass, token && code ? { token, code } : "skip");
  const load = useAction(api.resources.load);
  useLoadOnce(fetch && token && code ? `resources:${code}` : null, () => load({ token: token!, code }).then(heard), 5 * 60_000);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!token || !code) return;
    setRefreshing(true);
    try {
      await load({ token, code, force: true }).then(heard, () => {});
    } finally {
      setRefreshing(false);
    }
  }, [token, code, load]);
  return { data, refresh, refreshing };
}

/** When this device last asked for each lesson's plan. */
const planAsked = new Map<string, number>();
const PLAN_AGAIN = 3 * 3600 * 1000;

/**
 * The plans of these lessons: a plan, null for a lesson with none, undefined while it is not known. Lessons not looked
 * at lately are fetched; the server skips the ones it has, so asking is cheap.
 */
export function useLessonPlans(token: string | null, ids: string[]): Record<string, LessonPlan | null | undefined> {
  const key = [...new Set(ids)].sort();
  const joined = key.join(",");
  const plans = useQuery(api.plans.forLessons, token && key.length ? { token, ids: key } : "skip");
  const load = useAction(api.plans.load);
  useEffect(() => {
    if (!token || !joined) return;
    const now = Date.now();
    const due = joined.split(",").filter(id => now - (planAsked.get(id) ?? 0) > PLAN_AGAIN);
    if (!due.length) return;
    for (const id of due) planAsked.set(id, now);
    void load({ token, ids: due })
      .then(heard)
      .catch(() => {});
  }, [token, joined, load]);
  return plans ?? {};
}

/** A Compass page (a lesson plan, a page a teacher wrote), as plain blocks, fetched when it is first opened. */
export const usePageAction = () => useAction(api.resources.page);
