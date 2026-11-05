import { useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted } from "./store";
import { signOutNotice } from "./session";

/**
 * The timetable, a school day at a time (convex/timetable.ts). What the device last saw of each day is kept on it, so
 * a day paints on the first frame with the synced timetable and Convex's answer replaces it when it lands. A day the
 * sync has not fetched is asked for once.
 */

export type Day = NonNullable<FunctionReturnType<typeof api.timetable.day>>;
export type ReadyDay = Extract<Day, { status: "ready" }>;
export type Lesson = ReadyDay["lessons"][number];
export type Grade = NonNullable<Lesson["grade"]>;

/** How many days this device keeps: about a fortnight around wherever the person has been looking. */
const KEEP = 16;

type Kept = { owner: string; days: Record<string, ReadyDay> };
const kept = persisted<Kept | null>("cneo.days.v1", null);

/** Signing out takes the kept days with it. */
export const forgetDays = () => kept.set(null);

export function useDay(token: string | null, day: string): { day: ReadyDay | null; loading: boolean } {
  const live = useQuery(api.timetable.day, token ? { token, day } : "skip");
  const load = useAction(api.timetable.load);
  const asked = useRef(new Set<string>());
  // Whose days these are; a token's first characters are enough to tell two accounts on one device apart.
  const owner = token?.slice(0, 16) ?? "";

  useEffect(() => {
    if (!token || live?.status !== "missing" || asked.current.has(day)) return;
    asked.current.add(day);
    void load({ token, day })
      .then(r => {
        if (!r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
      })
      .catch(() => {});
  }, [token, day, live?.status, load]);

  useEffect(() => {
    if (live?.status !== "ready") return;
    const prev = kept.get();
    if (prev?.owner === owner && JSON.stringify(prev.days[day]) === JSON.stringify(live)) return;
    const days = prev?.owner === owner ? { ...prev.days, [day]: live } : { [day]: live };
    // Keep the days nearest this one.
    const near = Object.keys(days)
      .sort((a, b) => Math.abs(Date.parse(a) - Date.parse(day)) - Math.abs(Date.parse(b) - Date.parse(day)))
      .slice(0, KEEP);
    kept.set({ owner, days: Object.fromEntries(near.map(d => [d, days[d]!])) });
  }, [live, day, owner]);

  const stored = kept.use();
  if (live?.status === "ready") return { day: live, loading: false };
  const cached = stored?.owner === owner ? (stored.days[day] ?? null) : null;
  return { day: cached, loading: !cached };
}

/** Where a lesson stands against the clock: over, on now, or still to come. */
export type When = "past" | "now" | "later";
export const whenOf = (l: Lesson, now: number): When =>
  Date.parse(l.finish) <= now ? "past" : Date.parse(l.start) <= now ? "now" : "later";

/**
 * A name for each lesson on a day: the day, the class code, and which of the day's lessons of that class it is (a
 * double period is two). A card and its focused view share it, so the card grows into its own view and back.
 */
export function keysOf(lessons: Lesson[], day: string) {
  const seen = new Map<string, number>();
  return lessons.map(l => {
    const n = seen.get(l.code) ?? 0;
    seen.set(l.code, n + 1);
    return `${day}/${l.code}#${n}`;
  });
}

export type Arranged = {
  /** The lesson that matters most: on now, or next today; the first on any other day. */
  hero: Lesson | null;
  /** The two after it, a size down. */
  rows: Lesson[];
  /** The rest of the day, small, two to a row. */
  tiles: Lesson[];
  /** Today's lessons already over, smallest and dimmed, at the end. */
  done: Lesson[];
  /** Every lesson today is over. */
  over: boolean;
};

/** How a day's lessons are laid out, biggest first. */
export function arrange(lessons: Lesson[], now: number, isToday: boolean): Arranged {
  const ahead = isToday ? lessons.filter(l => whenOf(l, now) !== "past") : lessons;
  const done = isToday ? lessons.filter(l => whenOf(l, now) === "past") : [];
  return {
    hero: ahead[0] ?? null,
    rows: ahead.slice(1, 3),
    tiles: ahead.slice(3),
    done,
    over: isToday && lessons.length > 0 && ahead.length === 0,
  };
}
