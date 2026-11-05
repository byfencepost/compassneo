import { useEffect } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";

/**
 * Lesson plans (convex/plans.ts): what a teacher wrote in Compass for a lesson, as plain blocks. Kept on the server per
 * lesson; asking for lessons Compass Neo has not looked at (or looked at a while ago) fetches them, and the answer
 * arrives through the query.
 */

export type LessonPlan = NonNullable<FunctionReturnType<typeof api.plans.forLessons>[string]>;
export type PlanBlock = LessonPlan["blocks"][number];

/** When this device last asked the server to fetch each lesson's plan, so a re-render never asks twice. */
const asked = new Map<string, number>();
const AGAIN = 3 * 3600 * 1000;

/**
 * The plans of these lessons: a plan, null for a lesson with none, undefined while it is not known yet. Lessons not
 * known yet (or known a while ago) are fetched.
 */
export function useLessonPlans(token: string | null, ids: string[]): Record<string, LessonPlan | null | undefined> {
  const key = [...new Set(ids)].sort();
  const plans = useQuery(api.plans.forLessons, token && key.length ? { token, ids: key } : "skip");
  const load = useAction(api.plans.load);
  const joined = key.join(",");

  useEffect(() => {
    if (!token) return;
    // The server skips lessons it looked at lately, so asking is cheap; this only keeps one device from asking again
    // on every render.
    const now = Date.now();
    const due = joined ? joined.split(",").filter(id => now - (asked.get(id) ?? 0) > AGAIN) : [];
    if (!due.length) return;
    for (const id of due) asked.set(id, now);
    void load({ token, ids: due }).catch(() => {});
  }, [token, joined, load]);

  return plans ?? {};
}
