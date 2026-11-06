import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import type { Palette } from "@/theme/tokens";

/**
 * Every grade at once (convex/overview.ts `grades`), as the web's Grades page reads it: the day's semester, the other
 * one, the marks as they came in. It reads only what the sync has kept, so it answers at once and follows each sync.
 */

export type OverviewGrades = NonNullable<FunctionReturnType<typeof api.overview.grades>>;
export type ReadyGrades = Extract<OverviewGrades, { status: "ready" }>;
export type GradeSource = ReadyGrades["source"];
export type OverviewSubject = ReadyGrades["subjects"][number];
export type RecentMark = ReadyGrades["recent"][number];
export type UpcomingAssessment = ReadyGrades["upcoming"][number];
export type GradeTrend = NonNullable<OverviewSubject["trend"]>;

/** undefined while loading; null for a signed-out device. The day sets which semester is "this" one. */
export function useGrades(token: string | null, day: string) {
  return useQuery(api.overview.grades, token ? { token, day } : "skip");
}

/** The sync's steps that bring grades (server: sync.ts), for pull to refresh and when they were last checked. */
export const GRADE_STEPS = ["connect:grades", "canvas:grades"];

export const sourceName = (s: GradeSource) => (s === "canvas" ? "Canvas" : "Connect");

/** "87.5" or "92": a decimal only when there is one. */
export const pct = (n: number) => String(Math.round(n * 10) / 10);

/** A trend worth showing: a move of at least a tenth of a point. */
export const moved = (t: GradeTrend | null | undefined): t is GradeTrend => !!t && Math.abs(t.change) >= 0.1;

const DAY = 86400 * 1000;

/** "Up 2.5 points in 7 days": a trend in full, for a screen reader. */
export function trendWords(t: GradeTrend, now: number) {
  const points = pct(Math.abs(t.change));
  const days = Math.max(1, Math.round((now - t.since) / DAY));
  return `${t.change > 0 ? "Up" : "Down"} ${points} ${points === "1" ? "point" : "points"} in ${days === 1 ? "a day" : `${days} days`}`;
}

/** A mark's colour, as the web's grade history has it: green from 80, Neo blue from 65, amber from 50, coral under. */
export function markColor(percent: number, c: Palette) {
  return percent >= 80 ? c.okText : percent >= 65 ? c.neoText : percent >= 50 ? c.warnText : c.failText;
}

/** Numbers that line up down a column. */
export const tabular = { fontVariant: ["tabular-nums" as const] };
