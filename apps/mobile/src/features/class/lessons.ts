import { addDays, clock, dayName, daysApart, minutes, shortDate } from "@/lib/days";
import type { ClassLesson } from "./data";

/**
 * The class's lessons against the clock: which one the screen leads with, how the header names the next one, and the
 * weeks they fall in. All in the school's zone (lib/days.ts); the server sends every lesson in the weeks around the day.
 */

/** Where a lesson stands now. */
export const isOn = (l: ClassLesson, now: number) => Date.parse(l.start) <= now && now < Date.parse(l.finish);
export const isOver = (l: ClassLesson, now: number) => Date.parse(l.finish) <= now;

/**
 * The lesson worth leading with: the one on the day the class was opened from, unless that is today and it is over,
 * then the one on now or next. `next` says it is the next one rather than the day's.
 */
export function leadLesson(lessons: ClassLesson[], openedOn: string | null, today: string, now: number) {
  const ahead = lessons.filter(l => !isOver(l, now));
  // A double lesson on the day leads with the half still to come.
  const onDayAll = openedOn ? lessons.filter(l => l.day === openedOn) : [];
  const onDay = onDayAll.find(l => !isOver(l, now)) ?? onDayAll[0];
  if (onDay && !(onDay.day === today && isOver(onDay, now))) return { lesson: onDay, next: false, ahead };
  return { lesson: ahead[0] ?? onDay ?? null, next: true, ahead };
}

/** "P3" or "1:20": a lesson's slot as the timetable names it. */
export const slotOf = (l: ClassLesson, zone: string) => (l.period != null ? `P${l.period}` : clock(l.start, zone));

/** "9:50 – 10:40". */
export const rangeOf = (l: ClassLesson, zone: string) => `${clock(l.start, zone)} – ${clock(l.finish, zone)}`;

/** A day as it reads mid-sentence: "today", "tomorrow", "Thursday", "Mon 10 Nov". */
export function dayWord(day: string, today: string) {
  const n = daysApart(today, day);
  const name = dayName(day, today);
  return n >= -1 && n <= 1 ? name.toLowerCase() : name;
}

/** The header's line: "On now · P3, Room B12 · 20 min left", "Next: Thursday P3, Room B12"; null with none to come. */
export function nextLine(lessons: ClassLesson[], zone: string, today: string, now: number) {
  const l = lessons.find(x => !isOver(x, now));
  if (!l) return null;
  const room = l.room ? `, Room ${l.room}` : "";
  if (isOn(l, now)) return `On now · ${slotOf(l, zone)}${room} · ${minutes(Date.parse(l.finish) - now)} left`;
  return `Next: ${dayWord(l.day, today)} ${slotOf(l, zone)}${room}`;
}

/** The lesson card's first line: "On now · 20 min left", "Today · starts in 45 min", "Next lesson · Thursday". */
export function whenLine(l: ClassLesson, next: boolean, today: string, now: number) {
  const start = Date.parse(l.start);
  const finish = Date.parse(l.finish);
  if (start <= now && now < finish) return `On now · ${minutes(finish - now)} left`;
  const day = dayName(l.day, today);
  const when = finish <= now ? `${day} · finished` : l.day === today && start - now < 90 * 60000 ? `Today · starts in ${minutes(start - now)}` : day;
  return next ? `Next lesson · ${when}` : when;
}

/** The Monday of a day's school week (a Sunday belongs to the week before). */
export function mondayOf(day: string) {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

/** "This week", "Next week", "Last week", "Week of 17 Nov". */
export function weekName(monday: string, today: string) {
  const n = Math.round(daysApart(mondayOf(today), monday) / 7);
  if (n === 0) return "This week";
  if (n === 1) return "Next week";
  if (n === -1) return "Last week";
  return `Week of ${shortDate(monday)}`;
}

export type Week = { monday: string; lessons: ClassLesson[] };

/** Lessons in their weeks, oldest first. */
export function weeksOf(lessons: ClassLesson[]): Week[] {
  const out: Week[] = [];
  for (const l of lessons) {
    const monday = mondayOf(l.day);
    const last = out[out.length - 1];
    if (last?.monday === monday) last.lessons.push(l);
    else out.push({ monday, lessons: [l] });
  }
  return out;
}
