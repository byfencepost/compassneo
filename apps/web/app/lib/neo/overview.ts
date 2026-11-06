import { useQuery } from "./live";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";

/**
 * Home's overview (convex/overview.ts): every grade at once, with the semester as one figure, for the Grades row and
 * its page in the side panel, and every piece of work not handed in yet, for the to-do list. Both read what the sync
 * has kept, so they answer at once and follow each sync on their own.
 */

export type OverviewGrades = NonNullable<FunctionReturnType<typeof api.overview.grades>>;
export type ReadyGrades = Extract<OverviewGrades, { status: "ready" }>;
export type OverviewSubject = ReadyGrades["subjects"][number];
export type GradeAggregate = ReadyGrades["aggregate"];
export type GradeTrend = NonNullable<GradeAggregate["trend"]>;
export type RecentMark = ReadyGrades["recent"][number];
export type UpcomingAssessment = ReadyGrades["upcoming"][number];

export type Todo = NonNullable<FunctionReturnType<typeof api.overview.todo>>;
export type TodoItem = Todo["items"][number];

/** undefined while loading; null for a signed-out device. The day sets which semester is "this" one. */
export function useOverviewGrades(token: string | null, day: string) {
  return useQuery(api.overview.grades, token ? { token, day } : "skip");
}

/** undefined while loading; null for a signed-out device. */
export function useTodo(token: string | null) {
  return useQuery(api.overview.todo, token ? { token } : "skip");
}

/** A trend worth showing: a move of at least a tenth of a point. */
export const moved = (t: GradeTrend | null | undefined): t is GradeTrend => !!t && Math.abs(t.change) >= 0.1;
