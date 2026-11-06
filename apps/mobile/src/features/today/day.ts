import { addDays, clock, dayName, isWeekend, minutes, shortDate, shortDay, weekdayOf } from "@/lib/days";
import { whenOf, type DayAssembly, type Lesson, type ReadyDay } from "@/lib/timetable";

/**
 * How a day's lessons are laid out on a phone, after the web's day block (apps/web/app/features/timetable/day-view.tsx
 * and arrange() in apps/web/app/lib/neo/timetable.ts): one block, biggest first. The lesson on now (or next) is the
 * hero, the two after it are rows, the rest are tiles two to a row, with the school's assemblies at their times among
 * them. What is already over today sits at the foot as slim lines. Pure, so it can be read on its own.
 */

/** hero: on now or next. row: the two after. tile: the rest, two to a row. done: over today, one slim line. */
export type CellSize = "hero" | "row" | "tile" | "done";

export type LessonCell = { kind: "lesson"; key: string; lesson: Lesson; size: CellSize };
export type AssemblyCell = { kind: "assembly"; key: string; assembly: DayAssembly; done: boolean };
/** Two tiles side by side. */
export type PairCell = { kind: "pair"; key: string; left: LessonCell; right: LessonCell };
/** One full-width band of the block. */
export type Cell = LessonCell | AssemblyCell | PairCell;

export type Laid = {
  cells: Cell[];
  /** Every lesson today is over. */
  over: boolean;
};

const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** An assembly comes before a lesson when it has no time, or starts at the lesson's own time or earlier. */
const before = (a: DayAssembly, l: Lesson) => !a.start || at(a.start) <= at(l.start);

export function layDay(day: ReadyDay, keys: string[], now: number, isToday: boolean): Laid {
  const all = day.lessons.map((lesson, i) => ({ lesson, key: keys[i] ?? `${day.day}/${lesson.code}#${i}` }));
  const past = (l: Lesson) => isToday && whenOf(l, now) === "past";
  const ahead = all.filter(x => !past(x.lesson));
  const gone = all.filter(x => past(x.lesson));

  const assemblies = day.assemblies ?? [];
  const isOver = (a: DayAssembly) => isToday && !!a.finish && at(a.finish) <= now;
  const assemblyCell = (a: DayAssembly, done: boolean): AssemblyCell => ({ kind: "assembly", key: `assembly:${a.id}`, assembly: a, done });
  const lessonCell = (x: { lesson: Lesson; key: string }, size: CellSize): LessonCell => ({ kind: "lesson", key: x.key, lesson: x.lesson, size });

  const [hero, ...rest] = ahead;
  const cells: Cell[] = hero ? [lessonCell(hero, "hero")] : [];

  // The rest by time, sized by place (two rows, then tiles), with the assemblies to come at their times among them:
  // never above the hero, the lesson that matters now.
  const queue = assemblies.filter(a => !isOver(a));
  const seq: (LessonCell | AssemblyCell)[] = [];
  rest.forEach((x, i) => {
    while (queue.length && before(queue[0]!, x.lesson)) seq.push(assemblyCell(queue.shift()!, false));
    seq.push(lessonCell(x, i < 2 ? "row" : "tile"));
  });
  seq.push(...queue.map(a => assemblyCell(a, false)));

  // Tiles pair up between one assembly and the next; an odd one out in a run joins the rows rather than standing alone.
  let run: LessonCell[] = [];
  const flush = () => {
    const odd = run.length % 2 === 1;
    if (odd) cells.push({ ...run[0]!, size: "row" });
    for (let i = odd ? 1 : 0; i < run.length; i += 2) cells.push({ kind: "pair", key: `${run[i]!.key}+${run[i + 1]!.key}`, left: run[i]!, right: run[i + 1]! });
    run = [];
  };
  for (const cell of seq) {
    if (cell.kind === "lesson" && cell.size === "tile") run.push(cell);
    else {
      flush();
      cells.push(cell);
    }
  }
  flush();

  // What is over today stays on the day, after the rest, in time order.
  const finished = [
    ...gone.map(x => ({ t: at(x.lesson.start), cell: lessonCell(x, "done") as Cell })),
    ...assemblies.filter(isOver).map(a => ({ t: at(a.start), cell: assemblyCell(a, true) as Cell })),
  ].sort((a, b) => a.t - b.t);
  cells.push(...finished.map(f => f.cell));

  return { cells, over: isToday && all.length > 0 && ahead.length === 0 };
}

/** "9:50 – 10:40". */
export const timeRange = (l: { start: string; finish: string }, zone: string) => `${clock(l.start, zone)} – ${clock(l.finish, zone)}`;

/**
 * The line over the hero, as the web's card has it: how long is left of the lesson on now, or when the next one starts;
 * on any other day, its period.
 */
export function heroStatus(l: Lesson, now: number, isToday: boolean, zone: string) {
  if (!isToday) return l.period != null ? `Period ${l.period}` : null;
  if (whenOf(l, now) === "now") return `Now · ${minutes(Date.parse(l.finish) - now)} left`;
  const until = Date.parse(l.start) - now;
  return until < 90 * 60 * 1000 ? `Next · in ${minutes(until)}` : `Next · at ${clock(l.start, zone)}`;
}

/** "5 classes · 8:50 – 3:10", for the line under the day's name in the picker. */
export function daySummary(day: ReadyDay, zone: string) {
  const ls = day.lessons;
  if (!ls.length) return "No classes";
  const first = ls[0]!;
  const last = ls.reduce((a, b) => (Date.parse(b.finish) > Date.parse(a.finish) ? b : a));
  return `${ls.length} class${ls.length === 1 ? "" : "es"} · ${clock(first.start, zone)} – ${clock(last.finish, zone)}`;
}

/**
 * Which day the picker shows, in two parts: its name and the date beside it. "Today" and "Tomorrow" take the short
 * day ("Fri 6 Nov"), a weekday this week the date ("9 Nov"), and a far day's name has its date in it already.
 */
export function dayTitle(day: string, today: string): { name: string; date: string | null } {
  const name = dayName(day, today);
  if (/\d/.test(name)) return { name, date: null };
  return { name, date: name === weekdayOf(day) ? shortDate(day) : shortDay(day) };
}

/** The next weekday after a day: Friday's is Monday. */
export function nextSchoolDay(day: string) {
  let d = addDays(day, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** Within this of a lesson's start or end, an assembly counts as at its start or end (bells round to the minute). */
const EDGE = 5 * 60 * 1000;

/**
 * What an assembly does to a lesson, in words, as the web's class card says it: "Assembly instead", "Assembly 9:00 –
 * 9:40, then class", "Class, then assembly 2:10 – 2:40". One the notice is vague about starts "Maybe".
 */
export function assemblyText(l: Lesson, zone: string): string | null {
  const a = l.assembly;
  if (!a) return null;
  const what = a.maybe ? "Maybe an assembly" : "Assembly";
  if (a.replaces === "whole") return `${what} instead`;
  const range = a.start && a.finish ? `${clock(a.start, zone)} – ${clock(a.finish, zone)}` : a.start ? `at ${clock(a.start, zone)}` : null;
  if (!range) return what;
  if (Date.parse(a.start!) <= Date.parse(l.start) + EDGE) return `${what} ${range}, then class`;
  if (a.finish && Date.parse(a.finish) >= Date.parse(l.finish) - EDGE) return `Class, then ${what.toLowerCase()} ${range}`;
  return `${what} ${range}`;
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

/** When an assembly is on its day: its times, else the periods it takes, else that the notice did not say. */
export function assemblyTime(a: { start: string | null; finish: string | null; periods: number[] }, zone: string) {
  if (a.start && a.finish) return `${clock(a.start, zone)} – ${clock(a.finish, zone)}`;
  if (a.start) return `From ${clock(a.start, zone)}`;
  return periodsText(a.periods) ?? "Time not given";
}

/** Who an assembly is for and anything else the notice says, in one quiet line. */
export const assemblyAbout = (a: DayAssembly) => [a.audience, a.maybe ? "May not include you" : null, a.notes].filter(Boolean).join(" · ");

/** A grade's tone, as the web's donut names it: green from 80, Neo blue from 65, amber from 50, coral under. */
export const gradeTone = (percent: number) => (percent >= 80 ? "ok" : percent >= 65 ? "neo" : percent >= 50 ? "warn" : "fail");

/** "J. Smith" to "JS", for a face without a photo. */
export function initials(p: { name: string; full: string | null }) {
  const w = (p.full ?? p.name).replace(/\./g, " ").split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w.length > 1 ? (w[w.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

/** Everything a lesson's card shows, as one sentence for a screen reader. */
export function lessonLabel(l: Lesson, zone: string, lead?: string | null) {
  const parts = [
    lead,
    l.name,
    l.period != null ? `period ${l.period}` : null,
    `${clock(l.start, zone)} to ${clock(l.finish, zone)}`,
    l.timesWas ? `new times from the school's notices, Compass had ${clock(l.timesWas.start, zone)} to ${clock(l.timesWas.finish, zone)}` : null,
    l.room ? `room ${l.room}${l.roomWas ? `, moved from ${l.roomWas}` : ""}` : null,
    l.teacher ? `with ${l.teacher.full ?? l.teacher.name}${l.teacherWas ? `, relief for ${l.teacherWas.full ?? l.teacherWas.name}` : ""}` : null,
    assemblyText(l, zone),
    l.grade?.percent != null ? `grade ${Math.round(l.grade.percent)} percent` : null,
  ];
  return parts.filter(Boolean).join(", ");
}
