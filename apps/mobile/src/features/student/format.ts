import { addDays, dayIn, weekdayOf } from "@/lib/days";
import { HUES, type Palette } from "@/theme/tokens";
import type { EventSession } from "./data";

/**
 * The student pages' own helpers, ported from the web (apps/web/app/features/student/format.ts): attendance's colours,
 * times that can fall in the evening, the shape of an event that happens more than once, and the page colours. Names
 * of days and months come from tables, not Intl, so Hermes's locale data never decides how a date reads.
 */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "95.5" or "97": a decimal only when there is one. */
export const pctText = (p: number) => String(Math.round(p * 10) / 10);

/** Numbers that line up down a column. */
export const tabular = { fontVariant: ["tabular-nums" as const] };

/** "1, 8 and 15". */
export function listOf(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------- days and months ----------

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const noon = (day: string) => new Date(`${day}T12:00:00Z`);

/** "Tue". */
export const weekdayShort = (day: string) => WEEKDAY_SHORT[noon(day).getUTCDay()]!;
/** "Nov". */
export const monthShort = (day: string) => MONTHS[noon(day).getUTCMonth()]!.slice(0, 3);
/** "November". */
export const monthLong = (day: string) => MONTHS[noon(day).getUTCMonth()]!;
/** "Tue 22". */
export const weekdayDay = (day: string) => `${weekdayShort(day)} ${noon(day).getUTCDate()}`;
/** "Tue 22 September". */
export const fullDay = (day: string) => `${weekdayShort(day)} ${noon(day).getUTCDate()} ${monthLong(day)}`;

/** Monday is 0. */
export const weekdayIndex = (day: string) => (noon(day).getUTCDay() + 6) % 7;
export const mondayOf = (day: string) => addDays(day, -weekdayIndex(day));

// ---------- attendance ----------

/**
 * Attendance's colour, on WA's own bands: 90% and over is regular attendance (green), 80 to 90 is at risk (amber),
 * under 80 is red.
 */
export type Tone = "ok" | "warn" | "fail";
export const attendanceTone = (p: number): Tone => (p >= 90 ? "ok" : p >= 80 ? "warn" : "fail");
export const toneText = (t: Tone, c: Palette) => ({ ok: c.okText, warn: c.warnText, fail: c.failText })[t];
export const toneFill = (t: Tone, c: Palette) => ({ ok: c.ok, warn: c.warn, fail: c.fail })[t];

/** How a roll or a period was marked, as a colour (markColor). */
export type Mark = "present" | "late" | "authorised" | "absent" | "none" | "other" | "class";

/** A period mark ("P", "AA", "UA", "-", "L") as one of the marks, read from its name as much as its code. */
export function markOf(code: string, name: string): Mark {
  if (code === "-" || /not recorded/i.test(name)) return "none";
  if (code === "L" || /\blate\b/i.test(name)) return "late";
  if (code === "UA" || /unauthori[sz]ed/i.test(name)) return "absent";
  if (code === "AA" || /authori[sz]ed/i.test(name)) return "authorised";
  if (/absen/i.test(name)) return "absent";
  if (code === "P" || /present/i.test(name)) return "present";
  return "other";
}

/** A mark's colour, as the web's student.css has it; "class" is a class's own colour, passed in. */
export function markColor(m: Mark, c: Palette, own?: string) {
  return {
    present: c.ok,
    late: c.warn,
    authorised: c.neo,
    absent: c.fail,
    other: c.text3,
    none: c.field,
    class: own ?? c.text3,
  }[m];
}

/** A mark's name, shorter: "Unauthorised absence" reads as "Unauthorised" beside its colour. */
export const markLabel = (name: string) => name.replace(/\s+absence$/i, "");

// ---------- the pages' colours ----------

/**
 * Each page's colour, a class hue (theme/tokens HUES): attendance wears its standing (green, amber or red, by the
 * year's share present), events blue, Chronicle violet. Its glyph on home and over each section.
 */
export function pageAccent(page: "attendance" | "events" | "chronicle", c: Palette, percent?: number | null) {
  const hue = page === "events" ? 8 : page === "chronicle" ? 10 : { ok: 4, warn: 2, fail: 0 }[attendanceTone(percent ?? 100)];
  return hueAccent(hue, c);
}

/** A class hue's colour for a glyph or a figure drawn on paper. */
export const hueAccent = (hue: number, c: Palette) => {
  const h = HUES[((hue % HUES.length) + HUES.length) % HUES.length]!;
  return c.dark ? h.dark : h.light;
};

// ---------- events ----------

const timeFormat = new Map<string, Intl.DateTimeFormat>();
/** "5:45 pm": an event's time, which (unlike a lesson's) can be at night, so it keeps am or pm. */
export function time(iso: string, zone: string) {
  let f = timeFormat.get(zone);
  if (!f) timeFormat.set(zone, (f = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "numeric", minute: "2-digit", hourCycle: "h23" })));
  const p = f.formatToParts(new Date(iso));
  const h = Number(p.find(x => x.type === "hour")?.value ?? 0) % 24;
  const m = p.find(x => x.type === "minute")?.value ?? "00";
  return `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
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
