import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { clock, dayIn } from "@/lib/days";

/**
 * The school's notices the student sees, read into bullet points by Claude, and the assemblies to come that are for
 * them (convex/announcements.ts `list`), as the web reads them (apps/web/app/lib/neo/announcements.ts). undefined while
 * loading, null before the first sync has fetched the feed.
 */

export type Announcements = NonNullable<FunctionReturnType<typeof api.announcements.list>>;
export type Notice = Announcements["notices"][number];
export type UpcomingAssembly = Announcements["assemblies"][number];

export const useAnnouncements = (token: string | null) => useQuery(api.announcements.list, { token });

/** The sync's step that brings the notices (convex/sync.ts), for when they were last checked and for pulling to refresh. */
export const NOTICE_STEPS = ["compass:news"];

/** The notices' colour, a class hue (teal), as the web's pages wear one each (features/student/meta.ts pageHue). */
export const NOTICES_HUE = 6;

/** The assemblies from today on that are not over yet, soonest first (the server sends them in order). */
export const upcomingAssemblies = (data: Announcements, today: string, now: number) =>
  data.assemblies.filter(a => a.date >= today && !(a.finish && Date.parse(a.finish) <= now));

/** Notices by the school day they were posted, newest day first (they come newest first). */
export function byDay(notices: Notice[], zone: string) {
  const days: { day: string; notices: Notice[] }[] = [];
  for (const n of notices) {
    const day = dayIn(zone, n.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.notices.push(n);
    else days.push({ day, notices: [n] });
  }
  return days;
}

/**
 * What a day's notices come to in a line or two: Claude's summary of the first it has read (a day usually has one
 * bulletin) and how many more there are; while Claude is still reading, that; else their titles.
 */
export function gist(notices: Notice[]) {
  const read = notices.find(n => n.summary);
  const more = notices.length - 1;
  if (read?.summary) return more > 0 ? `${read.summary} (+${more} more)` : read.summary;
  if (notices.some(n => n.status === "pending")) return "Claude is summing up the notices…";
  return notices.map(n => n.title).join(" · ");
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
