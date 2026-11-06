/**
 * School days, in the school's own time zone (a WA student in Melbourne for the week still sees Perth times, as the
 * timetable on the wall does). A day is written YYYY-MM-DD, as the server keeps it (convex/lib/days.ts).
 * Ported from apps/web/app/lib/neo/days.ts; dates are built from formatToParts so Hermes's locale data never decides
 * the order of year, month and day.
 */

const ZONES: Record<string, string> = {
  wa: "Australia/Perth",
  sa: "Australia/Adelaide",
  nt: "Australia/Darwin",
  qld: "Australia/Brisbane",
  nsw: "Australia/Sydney",
  act: "Australia/Sydney",
  vic: "Australia/Melbourne",
  tas: "Australia/Hobart",
};

export const zoneOf = (slug: string) => ZONES[/-([a-z]{2,3})$/.exec(slug)?.[1] ?? ""] ?? "Australia/Melbourne";

const dayFormat = new Map<string, Intl.DateTimeFormat>();
/** The day an instant falls on at the school. */
export function dayIn(zone: string, at: number | string | Date = Date.now()) {
  let f = dayFormat.get(zone);
  if (!f) dayFormat.set(zone, (f = new Intl.DateTimeFormat("en-AU", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })));
  const parts = f.formatToParts(new Date(at));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month").padStart(2, "0")}-${get("day").padStart(2, "0")}`;
}

const DAY = 24 * 60 * 60 * 1000;
const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);
export const addDays = (day: string, n: number) => new Date(noon(day) + n * DAY).toISOString().slice(0, 10);
export const daysApart = (from: string, to: string) => Math.round((noon(to) - noon(from)) / DAY);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (day: string) => {
  const d = new Date(noon(day));
  return { wd: d.getUTCDay(), date: d.getUTCDate(), month: d.getUTCMonth() };
};

export const weekdayOf = (day: string) => WEEKDAYS[parts(day).wd]!;
export const isWeekend = (day: string) => [0, 6].includes(parts(day).wd);

/** "5 Nov". */
export function shortDate(day: string) {
  const p = parts(day);
  return `${p.date} ${MONTHS[p.month]!.slice(0, 3)}`;
}

/** "Thursday 5 November". */
export function longDay(day: string) {
  const p = parts(day);
  return `${WEEKDAYS[p.wd]} ${p.date} ${MONTHS[p.month]}`;
}

/** "Thu 5 Nov". */
export function shortDay(day: string) {
  const p = parts(day);
  return `${WEEKDAYS[p.wd]!.slice(0, 3)} ${p.date} ${MONTHS[p.month]!.slice(0, 3)}`;
}

/** "Today", "Tomorrow", "Yesterday", a weekday this week, else "Mon 10 Nov". */
export function dayName(day: string, today: string) {
  const n = daysApart(today, day);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return weekdayOf(day);
  return shortDay(day);
}

const timeFormat = new Map<string, Intl.DateTimeFormat>();
/** "9:50", "1:20": the clock on the timetable, without am or pm (a lesson is never at 9:50 at night). */
export function clock(iso: string, zone: string) {
  let f = timeFormat.get(zone);
  if (!f) timeFormat.set(zone, (f = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true })));
  const p = f.formatToParts(new Date(iso));
  const hour = p.find(x => x.type === "hour")?.value ?? "";
  const minute = p.find(x => x.type === "minute")?.value ?? "";
  return `${Number(hour) || hour}:${minute}`;
}

/** "45 min", "1 hr", "1 hr 20 min". */
export function minutes(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

/** The class's last lesson before a piece of work is due, as the server works it out (convex/lib/lessons.ts). */
export type LastLesson = { kind: "lesson"; day: string; start: string; period: number | null } | { kind: "none" };

/** "Last lesson Thursday, P3", "Last lesson today, 1:20", "No lessons left"; null when the server does not know. */
export function lastLessonText(l: LastLesson | null | undefined, today: string, zone: string) {
  if (!l) return null;
  if (l.kind === "none") return "No lessons left";
  const n = daysApart(today, l.day);
  const day = n === 0 || n === 1 ? dayName(l.day, today).toLowerCase() : dayName(l.day, today);
  return `Last lesson ${day}, ${l.period != null ? `P${l.period}` : clock(l.start, zone)}`;
}
