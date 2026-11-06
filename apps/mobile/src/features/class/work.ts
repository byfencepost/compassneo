import { clock, dayIn, daysApart, longDay, shortDay, type LastLesson } from "@/lib/days";
import type { ClassWork, WorkFile, WorkItem, WorkState } from "./data";
import { dayWord } from "./lessons";

/**
 * Work from every side as one list, ported from the web (apps/web/app/features/class/work.tsx): where each piece
 * stands, how the list groups, and how a due date reads. Times are the school's, never the phone's.
 */

/** The state to show: a task still to do whose due date has passed is overdue, whatever the last fetch said. */
export const stateOf = (w: WorkItem, now: number): WorkState => (w.state === "todo" && w.due && Date.parse(w.due) < now ? "overdue" : w.state);

const ready = (side: ClassWork["compass"]) => (side.status === "ready" ? side.data : []);

/** Every piece of work from every side, and whether more than one side has some (so each says where it is from). */
export function workItems(work: ClassWork | null | undefined) {
  if (!work) return { items: [] as WorkItem[], mixed: false };
  const sides = [ready(work.compass), ready(work.connect), ready(work.canvas)];
  return { items: sides.flat(), mixed: sides.filter(s => s.length > 0).length > 1 };
}

/** When the latest of these files went in. */
export const latest = (files: WorkFile[]) =>
  files.reduce<string | null>((a, f) => (f.at && (!a || Date.parse(f.at) > Date.parse(a)) ? f.at : a), null);

export type WorkGroups = { overdue: WorkItem[]; todo: WorkItem[]; undated: WorkItem[]; done: WorkItem[]; earlier: WorkItem[] };

/** The list as the web groups it: overdue, to do (soonest first), no due date, handed in, and earlier. */
export function groupWork(items: WorkItem[], now: number): WorkGroups {
  const g: WorkGroups = { overdue: [], todo: [], undated: [], done: [], earlier: [] };
  for (const w of items) {
    const s = stateOf(w, now);
    if (s === "overdue") g.overdue.push(w);
    else if (s === "submitted" || s === "late") g.done.push(w);
    else if (s === "todo" && !w.due) g.undated.push(w);
    else if (s === "todo" || (s === "none" && w.due && Date.parse(w.due) >= now)) g.todo.push(w);
    else g.earlier.push(w);
  }
  const at = (d: string | null, none: number) => (d ? Date.parse(d) : none);
  g.todo.sort((a, b) => at(a.due, Infinity) - at(b.due, Infinity));
  g.undated.sort((a, b) => a.name.localeCompare(b.name));
  g.overdue.sort((a, b) => at(b.due, 0) - at(a.due, 0));
  g.done.sort((a, b) => at(latest(b.handedIn) ?? b.due, 0) - at(latest(a.handedIn) ?? a.due, 0));
  g.earlier.sort((a, b) => at(b.due, 0) - at(a.due, 0));
  return g;
}

const timeFormat = new Map<string, Intl.DateTimeFormat>();
/** "11:30 pm", in the school's zone. */
export function timeOf(iso: string, zone: string) {
  let f = timeFormat.get(zone);
  if (!f) timeFormat.set(zone, (f = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true })));
  const p = f.formatToParts(new Date(iso));
  const get = (t: string) => p.find(x => x.type === t)?.value ?? "";
  // Built from parts so Hermes's locale data never decides the spacing or the case of "pm".
  return `${Number(get("hour")) || get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase().replace(/\./g, "")}`.trim();
}

/** "Due Friday", "Due today, 3:30 pm", "Was due yesterday", "Was due Mon 10 Nov", "No due date". */
export function dueShort(due: string | null, zone: string, today: string, now: number) {
  if (!due) return "No due date";
  const day = dayIn(zone, due);
  return `${Date.parse(due) < now ? "Was due" : "Due"} ${dayWord(day, today)}${day === today ? `, ${timeOf(due, zone)}` : ""}`;
}

/** "Due Friday 18 September at 11:30 pm, in 3 days". */
export function dueLong(due: string | null, zone: string, today: string, now: number) {
  if (!due) return "No due date";
  const day = dayIn(zone, due);
  const away = daysApart(today, day);
  const when = away === 0 ? "today" : away === 1 ? "tomorrow" : away === -1 ? "yesterday" : longDay(day);
  const rel = away > 1 && away < 15 ? `, in ${away} days` : away < -1 && away > -15 ? `, ${-away} days ago` : "";
  return `${Date.parse(due) < now ? "Was due" : "Due"} ${when} at ${timeOf(due, zone)}${rel}`;
}

/** Due within a day: amber. */
export const dueSoon = (w: WorkItem, zone: string, today: string, now: number) =>
  stateOf(w, now) === "todo" && w.due != null && daysApart(today, dayIn(zone, w.due)) <= 1;

/** "Last lesson: Thu 5 Nov, P3 (9:50)", "Last lesson: today, 1:20": for the work's own detail. */
export function lastLessonLong(l: LastLesson | null | undefined, today: string, zone: string) {
  if (!l) return null;
  if (l.kind === "none") return "No lessons of this class left before it's due";
  const n = daysApart(today, l.day);
  const day = n === 0 ? "today" : n === 1 ? "tomorrow" : shortDay(l.day);
  return `Last lesson: ${day}, ${l.period != null ? `P${l.period} (${clock(l.start, zone)})` : clock(l.start, zone)}`;
}

/**
 * The groups with work just handed in kept where it was (`pins`: its key, and the group it was in when it went in), so
 * it does not leave the list from under the finger the moment the work reloads as handed in (hand-in.tsx `pinned`).
 */
export function keepInPlace(g: WorkGroups, pins: Record<string, keyof WorkGroups>): WorkGroups {
  const moved = g.done.filter(w => pins[w.key] && pins[w.key] !== "done");
  if (!moved.length) return g;
  const out: WorkGroups = { ...g, done: g.done.filter(w => !moved.includes(w)) };
  for (const w of moved) {
    const to = pins[w.key]!;
    out[to] = [...out[to], w];
  }
  return out;
}
