import type { CSSProperties } from "react";
import { addDays, dayIn, weekdayOf } from "@/lib/neo/days";
import type { EventSession } from "@/lib/neo/student";

/**
 * The student pages' own helpers: attendance's colours, times that can fall in the evening, and the shape of an event
 * that happens more than once.
 */

/** Custom properties for a class to read (w-(--w)): the one way Glaze takes a value known only at runtime. */
export const vars = (v: Record<`--${string}`, string | number>) => v as CSSProperties;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "95.5" or "97": a decimal only when there is one. */
export const pctText = (p: number) => String(Math.round(p * 10) / 10);

// ---------- attendance ----------

/**
 * Attendance's colour, on WA's own bands: 90% and over is regular attendance (green), 80 to 90 is at risk (amber),
 * under 80 is red.
 */
export type Tone = "ok" | "warn" | "fail";
export const attendanceTone = (p: number): Tone => (p >= 90 ? "ok" : p >= 80 ? "warn" : "fail");
export const toneText: Record<Tone, string> = { ok: "text-ok-text", warn: "text-warn-text", fail: "text-fail-text" };
/** The attendance page wears its standing: the class hue (brand.css) for green, amber or red. */
export const toneHue: Record<Tone, number> = { ok: 4, warn: 2, fail: 0 };

/** How a roll or a period was marked, as a colour (student.css, data-mark). */
export type Mark = "present" | "late" | "authorised" | "absent" | "none" | "other" | "class";

/** A Connect period mark ("P", "AA", "UA", "-", "L") as one of the marks, read from its name as much as its code. */
export function markOf(code: string, name: string): Mark {
  if (code === "-" || /not recorded/i.test(name)) return "none";
  if (code === "L" || /\blate\b/i.test(name)) return "late";
  if (code === "UA" || /unauthori[sz]ed/i.test(name)) return "absent";
  if (code === "AA" || /authori[sz]ed/i.test(name)) return "authorised";
  if (/absen/i.test(name)) return "absent";
  if (code === "P" || /present/i.test(name)) return "present";
  return "other";
}

/** A mark's name, shorter: "Unauthorised absence" reads as "Unauthorised" beside its colour. */
export const markLabel = (name: string) => name.replace(/\s+absence$/i, "");

/** Monday is 0. */
export const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
export const mondayOf = (day: string) => addDays(day, -weekdayIndex(day));

// ---------- events ----------

const timeFormat = new Map<string, Intl.DateTimeFormat>();
/** "5:45 pm": an event's time, which (unlike a lesson's) can be at night, so it keeps am or pm. */
export function time(iso: string, zone: string) {
  let f = timeFormat.get(zone);
  if (!f) timeFormat.set(zone, (f = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true })));
  return f
    .format(new Date(iso))
    .replace(/[  ]/g, " ")
    .replace(/\s*([ap])\.?\s*m\.?$/i, " $1m")
    .toLowerCase();
}

/** "5:45 – 9:45 pm", or "11:30 am – 1:30 pm" across noon. */
export function timeRange(start: string, finish: string, zone: string) {
  const a = time(start, zone);
  const b = time(finish, zone);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** A session's day at the school, and its last day when it runs over several (a camp). */
export function sessionDays(s: EventSession, zone: string) {
  const first = dayIn(zone, s.start);
  // An all-day session ends at the next midnight: its last day is the one before.
  const last = dayIn(zone, Date.parse(s.finish) - 60_000);
  return { first, last: last > first ? last : first };
}

export const sessionTime = (s: EventSession, zone: string) => (s.allDay ? "All day" : timeRange(s.start, s.finish, zone));

/** What a run of sessions has in common: the weekday ("Tuesdays") and the time, when every one shares it. */
export function pattern(sessions: EventSession[], zone: string) {
  const days = new Set(sessions.map(s => weekdayOf(dayIn(zone, s.start))));
  const times = new Set(sessions.map(s => sessionTime(s, zone)));
  return { weekday: days.size === 1 ? `${[...days][0]}s` : null, time: times.size === 1 ? [...times][0]! : null };
}
