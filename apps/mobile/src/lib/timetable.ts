import { useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted, useStored } from "./store";
import { signOutNotice } from "./notice";

/**
 * The timetable, a school day at a time (convex/timetable.ts), as the web app reads it (apps/web/app/lib/neo/timetable.ts).
 * What the phone last saw of each day is kept on it, so a day paints on the first frame and Convex's answer replaces
 * it when it lands. A day the sync has not fetched is asked for once.
 */

export type Day = NonNullable<FunctionReturnType<typeof api.timetable.day>>;
export type ReadyDay = Extract<Day, { status: "ready" }>;
export type Lesson = ReadyDay["lessons"][number];
export type Grade = NonNullable<Lesson["grade"]>;
export type DayAssembly = NonNullable<ReadyDay["assemblies"]>[number];
export type LessonAssembly = NonNullable<Lesson["assembly"]>;

/** How many days the phone keeps: about a fortnight around wherever the person has been looking. */
const KEEP = 16;

type Kept = { owner: string; days: Record<string, ReadyDay> };
const kept = persisted<Kept | null>("cneo.days.v1", null);

/** Signing out takes the kept days with it. */
export const forgetDays = () => kept.set(null);

/**
 * `keep: false` is a guest's (lib/guest.ts): their days are neither kept on the phone nor read from what it keeps, so
 * nothing of theirs stays behind and the phone's own student's days are left where they are. A guest's day failing to
 * load says nothing on the sign-in screen either: the phone's own sign-in is fine.
 */
export function useDay(token: string | null, day: string, opts?: { keep?: boolean }): { day: ReadyDay | null; loading: boolean } {
  const keep = opts?.keep ?? true;
  const live = useQuery(api.timetable.day, token ? { token, day } : "skip");
  const load = useAction(api.timetable.load);
  const asked = useRef(new Set<string>());
  const owner = token?.slice(0, 16) ?? "";

  useEffect(() => {
    if (!token || live?.status !== "missing" || asked.current.has(day)) return;
    asked.current.add(day);
    void load({ token, day })
      .then(r => {
        if (keep && !r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
      })
      .catch(() => {});
  }, [token, day, live?.status, load, keep]);

  useEffect(() => {
    if (!keep || live?.status !== "ready") return;
    const prev = kept.get();
    if (prev?.owner === owner && JSON.stringify(prev.days[day]) === JSON.stringify(live)) return;
    const days = prev?.owner === owner ? { ...prev.days, [day]: live } : { [day]: live };
    const near = Object.keys(days)
      .sort((a, b) => Math.abs(Date.parse(a) - Date.parse(day)) - Math.abs(Date.parse(b) - Date.parse(day)))
      .slice(0, KEEP);
    kept.set({ owner, days: Object.fromEntries(near.map(d => [d, days[d]!])) });
  }, [live, day, owner, keep]);

  const stored = useStored(kept);
  if (live?.status === "ready") return { day: live, loading: false };
  const cached = keep && stored?.owner === owner ? (stored.days[day] ?? null) : null;
  return { day: cached, loading: !cached };
}

/** Where a lesson stands against the clock: over, on now, or still to come. */
export type When = "past" | "now" | "later";
export const whenOf = (l: Lesson, now: number): When =>
  Date.parse(l.finish) <= now ? "past" : Date.parse(l.start) <= now ? "now" : "later";

/** A key per lesson on a day: the day, the class code, and which of the day's lessons of that class it is. */
export function keysOf(lessons: Lesson[], day: string) {
  const seen = new Map<string, number>();
  return lessons.map(l => {
    const n = seen.get(l.code) ?? 0;
    seen.set(l.code, n + 1);
    return `${day}/${l.code}#${n}`;
  });
}
