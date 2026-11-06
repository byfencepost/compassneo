import type { StoredLesson } from "../timetable";
import { shortName, type Person } from "./match";

/**
 * The morning brief's clock and words (convex/brief.ts): an hour before the day's first class, the relief teachers and
 * room changes in today's lessons, as one notification.
 *
 *   T-75 to T-65  the timetable is made fresh: a sync is asked for if it was last fetched over STALE ago
 *   T-60 to T     told, as soon as a look finds a change (a relief posted at 8:20 is still told before a 8:45 start)
 *   T on          nothing: the day has begun, and what was not told is not told
 *
 * T is the start of the day's first class, homeroom included (it is when the student has to be somewhere). A day with
 * no classes (a weekend, a holiday, a student-free day) has no brief.
 */

const MINUTE = 60 * 1000;
export const ASK_FROM = 75 * MINUTE;
export const ASK_UNTIL = 65 * MINUTE;
export const TELL_FROM = 60 * MINUTE;
/** A timetable fetched longer ago than this is refreshed for the brief, and waited on (see LAST_CALL). */
export const STALE = 20 * MINUTE;
/** A brief whose timetable is still stale is told anyway from this long before the first class (the refresh failed). */
export const LAST_CALL = 30 * MINUTE;

/** The school's morning, on its own clock, when a brief can be due: first classes from 6:15am to noon. */
export const MORNING_FROM = "05:00";
export const MORNING_TO = "12:00";

/** Every offset an Australian school keeps, in hours: WA, SA and NT, the east coast, and SA and the east in summer. */
const OFFSETS = [8, 9.5, 10, 10.5, 11];
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether it is morning at any school: when it is not (most of the Australian day), the brief has nothing to look at. */
export function someMorning(now: number) {
  const utc = Math.floor(now / MINUTE) % 1440;
  return OFFSETS.some(o => {
    const local = (utc + o * 60) % 1440;
    return local >= minutesOf(MORNING_FROM) && local < minutesOf(MORNING_TO);
  });
}

export type BriefMoment =
  /** No classes today, too early, or the first class has started. */
  | { phase: "off" }
  /** ask: freshen the timetable. early: between asking and telling. tell: tell the changes, if there are any. */
  | { phase: "ask" | "early" | "tell"; first: number; changed: StoredLesson[] };

/** Where the brief is for a day's kept lessons at an instant, and the lessons with a relief teacher or a new room. */
export function briefMoment(items: StoredLesson[], now: number): BriefMoment {
  const lessons = items.filter(l => l.isClass && !l.allDay && Number.isFinite(Date.parse(l.start))).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (!lessons.length) return { phase: "off" };
  const first = Date.parse(lessons[0]!.start);
  if (now >= first || now < first - ASK_FROM) return { phase: "off" };
  const phase = now < first - ASK_UNTIL ? "ask" : now < first - TELL_FROM ? "early" : "tell";
  return { phase, first, changed: lessons.filter(l => l.cover || l.coverRoom) };
}

/**
 * The changes in words, a class at a time, as the app names classes and teachers:
 * "Maths: J. Lee instead of R. Wims · English: Room 12 (was 404)". A double period changed the same way is said once.
 */
export function changesLine(changed: StoredLesson[], who: (code: string | null) => Person | null) {
  const name = (code: string) => who(code)?.name ?? code;
  const parts: string[] = [];
  for (const l of changed) {
    const bits: string[] = [];
    if (l.cover) bits.push(l.teacher ? `${name(l.cover)} instead of ${name(l.teacher)}` : `${name(l.cover)} covering`);
    if (l.coverRoom) bits.push(`${bits.length ? "room" : "Room"} ${l.coverRoom}${l.room ? ` (was ${l.room})` : ""}`);
    if (!bits.length) continue;
    const part = `${shortName(l.subject, l.code)}: ${bits.join(", ")}`;
    if (!parts.includes(part)) parts.push(part);
  }
  return parts.join(" · ");
}
