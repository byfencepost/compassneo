import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { clock } from "./days";

/**
 * The school's notices the student sees, read into bullet points, and the assemblies to come that are for them
 * (convex/announcements.ts). undefined while loading, null before the first sync has fetched the feed.
 */

export type Announcements = NonNullable<FunctionReturnType<typeof api.announcements.list>>;
export type Notice = Announcements["notices"][number];
export type UpcomingAssembly = Announcements["assemblies"][number];

export function useAnnouncements(token: string | null) {
  return useQuery(api.announcements.list, token ? { token } : "skip");
}

/** "Period 3", "Periods 2 and 3", "Periods 2 to 4". */
export function periodsText(periods: number[]) {
  const ps = [...periods].sort((a, b) => a - b);
  if (!ps.length) return null;
  if (ps.length === 1) return `Period ${ps[0]}`;
  const run = ps.every((p, i) => i === 0 || p === ps[i - 1]! + 1);
  if (run && ps.length > 2) return `Periods ${ps[0]} to ${ps[ps.length - 1]}`;
  return `Periods ${ps.slice(0, -1).join(", ")} and ${ps[ps.length - 1]}`;
}

/** When an assembly is, on its day: its times, else the periods it takes, else that the notice did not say. */
export function assemblyTime(a: { start: string | null; finish: string | null; periods: number[] }, zone: string) {
  if (a.start && a.finish) return `${clock(a.start, zone)} – ${clock(a.finish, zone)}`;
  if (a.start) return `From ${clock(a.start, zone)}`;
  return periodsText(a.periods) ?? "Time not given";
}

/** The assemblies from today on that are not over yet, soonest first (the server sends them in order). */
export const upcomingAssemblies = (data: Announcements, today: string, now: number) =>
  data.assemblies.filter(a => a.date >= today && !(a.finish && Date.parse(a.finish) <= now));
