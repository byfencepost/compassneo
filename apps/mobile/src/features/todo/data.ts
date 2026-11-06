import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { dayIn, dayName, daysApart } from "@/lib/days";

/**
 * Every piece of work not handed in yet, across every class (convex/overview.ts `todo`): Compass's learning tasks,
 * Connect's open submissions and Canvas's assignments. Read from what the sync keeps, so it answers at once and
 * follows each sync on its own.
 */

export type Todo = NonNullable<FunctionReturnType<typeof api.overview.todo>>;
export type TodoItem = Todo["items"][number];
export type Source = TodoItem["source"];

/** undefined while loading; null for a signed-out device. */
export function useTodo(token: string | null) {
  return useQuery(api.overview.todo, token ? { token } : "skip");
}

export const SOURCE: Record<Source, string> = { compass: "Compass", connect: "Connect", canvas: "Canvas" };

const DAY = 86400 * 1000;
/** Work with no hand-in online stays on the list this long after its date (as convex/overview.ts keeps it). */
const OFFLINE_OVERDUE = 7 * DAY;

/**
 * The list as of now, as the web's to-do list keeps it: the server worked overdue out when it last answered, so a date
 * passed since is overdue too, and a task with no hand-in online leaves the list a week after its date.
 */
export function freshen(items: TodoItem[], now: number): TodoItem[] {
  return items
    .filter(i => !(i.offline && i.due && Date.parse(i.due) < now - OFFLINE_OVERDUE))
    .map(i => (!i.overdue && i.due && Date.parse(i.due) < now ? { ...i, overdue: true } : i))
    .sort(byUrgency);
}

/** Overdue first (the most recently missed first, as the class's Work lists them), then soonest due, undated last. */
function byUrgency(a: TodoItem, b: TodoItem) {
  const at = (d: string | null, none: number) => (d ? Date.parse(d) : none);
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  return a.overdue ? at(b.due, 0) - at(a.due, 0) : at(a.due, Infinity) - at(b.due, Infinity) || 0;
}

// ---------- grouping ----------

export type Bucket = "overdue" | "today" | "tomorrow" | "soon" | "later" | "undated";
const ORDER: Bucket[] = ["overdue", "today", "tomorrow", "soon", "later", "undated"];
const TITLES: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  soon: "Coming up",
  later: "Later",
  undated: "No due date",
};

export type TodoSection = { key: Bucket; title: string; data: TodoItem[] };

/** Where a piece of work sits: overdue, then by how soon it is due at the school (the next six days are coming up). */
function bucketOf(i: TodoItem, today: string, zone: string): Bucket {
  if (i.overdue) return "overdue";
  if (!i.due) return "undated";
  const away = daysApart(today, dayIn(zone, i.due));
  return away <= 0 ? "today" : away === 1 ? "tomorrow" : away < 7 ? "soon" : "later";
}

/**
 * The list in sections, in the order the web lists it (every overdue piece first, then by when it is due), with a
 * heading for each stretch, so a long list on a phone can be read at a glance. The list comes in sorted, so each
 * section keeps that order.
 */
export function sectionsOf(items: TodoItem[], today: string, zone: string): TodoSection[] {
  const by = new Map<Bucket, TodoItem[]>();
  for (const i of items) {
    const b = bucketOf(i, today, zone);
    by.set(b, [...(by.get(b) ?? []), i]);
  }
  return ORDER.filter(b => by.has(b)).map(b => ({ key: b, title: TITLES[b], data: by.get(b)! }));
}

// ---------- words ----------

const timeFormat = new Map<string, Intl.DateTimeFormat>();
/**
 * "9:00 am", "11:59 pm": when work is due at the school. Unlike a lesson's clock it keeps am or pm, as work is often due
 * at night. Built from the 24-hour parts, so the engine's locale data never decides how am and pm are written.
 */
export function time(iso: string, zone: string) {
  let f = timeFormat.get(zone);
  if (!f) timeFormat.set(zone, (f = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false })));
  const parts = f.formatToParts(new Date(iso));
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0) % 24;
  const m = parts.find(p => p.type === "minute")?.value ?? "00";
  return `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

export type Due = { text: string; tone: "late" | "soon" | "plain" };

/**
 * When a piece of work is due, in the web's words (apps/web/app/features/home/todo-list.tsx), short enough for the end
 * of a row: "Due today 9:00 am", "Due tomorrow 11:59 pm", "Due Friday", "Due Mon 10 Nov", "Was due 3:15 pm" (missed
 * today), "Overdue 2 days", and how pressing it is (late in amber, today's and tomorrow's in full ink).
 */
export function dueOf(item: TodoItem, zone: string, today: string): Due {
  if (!item.due) return { text: "No due date", tone: "plain" };
  const day = dayIn(zone, item.due);
  const away = daysApart(today, day);
  if (item.overdue) {
    if (away >= 0) return { text: `Was due ${time(item.due, zone)}`, tone: "late" };
    return { text: `Overdue ${-away} ${away === -1 ? "day" : "days"}`, tone: "late" };
  }
  if (away <= 0) return { text: `Due today ${time(item.due, zone)}`, tone: "soon" };
  if (away === 1) return { text: `Due tomorrow ${time(item.due, zone)}`, tone: "soon" };
  return { text: `Due ${dayName(day, today)}`, tone: "plain" };
}
