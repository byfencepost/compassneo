import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { slugRegion } from "@compassneo/compass";
import { schoolZone } from "./days";

/**
 * Assemblies from the school's notices, laid over a student's timetable when it is read (convex/timetable.ts' day
 * query, and the upcoming list in convex/announcements.ts). Compass's own timetable never changes for an assembly, so
 * nothing here writes to the stored days: a notice that is corrected, or read again, simply lays differently next
 * time.
 *
 * Period numbers in a notice are matched against the periods the app shows (periodsOf in convex/timetable.ts: the
 * day's classes counted from 1, homeroom left out), not Compass's own bell-slot numbers, because a notice's "Period 3"
 * is the period students call 3, and at a school with a homeroom slot Compass numbers that lesson 4.
 */

export type Parsed = NonNullable<Doc<"announcements">["parsed"]>;
export type ParsedAssembly = Parsed["assemblies"][number];
export type ParsedBells = Parsed["bells"][number];

/** An assembly on a day, as the day view and the notices on home show it. */
export type DayAssembly = {
  id: string;
  title: string;
  /** ISO instants; null when the notice gives no time and no period of the student's to take it from. */
  start: string | null;
  finish: string | null;
  periods: number[];
  place: string | null;
  /** Who it is for, in words: "Whole school", "Year 10", "Years 10 to 12, award winners". */
  audience: string;
  notes: string | null;
  /** It may not be for this student (a narrower group, a year the app could not work out) or the notice is vague. */
  maybe: boolean;
  /** The notice it is from. */
  notice: { id: string; title: string };
};

/** What a lesson carries when an assembly takes some or all of it. */
export type LessonAssembly = {
  id: string;
  title: string;
  start: string | null;
  finish: string | null;
  place: string | null;
  replaces: "whole" | "part";
  maybe: boolean;
};

type Timed = { start: string; finish: string; period: number | null };

const MINUTE = 60 * 1000;
/** Overlaps shorter than this are a bell's rounding, not an assembly in the lesson. */
const SLACK = 5 * MINUTE;

// ---------- the student ----------

/**
 * The student's year level from their form group: "10B", "Y10A", "Yr 9 Blue" and "07C" are years 10, 10, 9 and 7.
 * Null when the group does not start with a year ("PC3", "Gold"): the student's assemblies are then shown as maybes.
 */
export function yearOf(formGroup: string | null | undefined): number | null {
  const m = /^\s*(?:y(?:ea)?r?\.?\s*)?0?(\d{1,2})(?!\d)/i.exec(formGroup ?? "");
  const n = m ? Number(m[1]) : NaN;
  return n >= 0 && n <= 13 ? n : null;
}

/** Whether something for some year levels (none: everyone) and maybe a narrower group is for this student. */
export function forStudent(a: { years: number[]; group?: string | null }, year: number | null): { applies: boolean; maybe: boolean } {
  const narrower = !!a.group?.trim();
  if (!a.years.length) return { applies: true, maybe: narrower };
  if (year == null) return { applies: true, maybe: true };
  return a.years.includes(year) ? { applies: true, maybe: narrower } : { applies: false, maybe: false };
}

/** "Whole school", "Year 10", "Years 10 to 12", "Years 7, 9 and 11", with a narrower group after a comma. */
export function audienceOf(a: { years: number[]; group?: string | null }): string {
  const group = a.group?.trim() || null;
  const ys = [...a.years].sort((x, y) => x - y);
  const run = ys.length > 2 && ys.every((y, i) => i === 0 || y === ys[i - 1]! + 1);
  const years = !ys.length
    ? null
    : ys.length === 1
      ? `Year ${ys[0]}`
      : run
        ? `Years ${ys[0]} to ${ys[ys.length - 1]}`
        : `Years ${ys.slice(0, -1).join(", ")} and ${ys[ys.length - 1]}`;
  if (years && group) return `${years}, ${group}`;
  return years ?? (group ? group[0]!.toUpperCase() + group.slice(1) : "Whole school");
}

// ---------- the school's clock ----------

/** Standard offsets in minutes, for a runtime without time zone data. */
const STANDARD: Record<string, number> = { wa: 480, sa: 570, nt: 570 };

/** The school's offset from UTC, in minutes, at an instant (daylight saving included where the state keeps it). */
function offsetAt(slug: string, at: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: schoolZone(slug),
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).formatToParts(new Date(at));
    const n = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"));
    if (Number.isFinite(local)) return Math.round((local - Math.floor(at / MINUTE) * MINUTE) / MINUTE);
  } catch {
    // Falls back to the standard offset below.
  }
  return STANDARD[slugRegion(slug) ?? ""] ?? 600;
}

/** A school day and an "HH:MM" on its clock as an ISO instant. Null when the time is not one. */
export function instantAt(day: string, hhmm: string | null, slug: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const wall = Date.parse(`${day}T00:00:00Z`) + (h * 60 + min) * MINUTE;
  if (h > 23 || min > 59 || Number.isNaN(wall)) return null;
  // The offset at about that instant (the wall time less a typical offset), so a daylight saving day lands right.
  return new Date(wall - offsetAt(slug, wall - 600 * MINUTE) * MINUTE).toISOString();
}

// ---------- reading ----------

/** A student's "news" row in compassCache: which of the school's items they see. Older rows were a bare list. */
type NewsRow = { items?: Array<{ id: string; at: string | null }> } | Array<{ id: string | number | null; at?: string | null }>;

/**
 * The notices a student sees that were posted between two days (both included; an item with no date is always in),
 * newest first. Each is the school-wide row, read once and shared.
 */
export async function noticesFor(ctx: QueryCtx, account: Doc<"accounts">, from: string, to: string): Promise<Doc<"announcements">[]> {
  const row = await ctx.db
    .query("compassCache")
    .withIndex("by_account_kind", i => i.eq("accountId", account._id).eq("kind", "news"))
    .unique();
  const data = (row?.data ?? null) as NewsRow | null;
  const listed = (Array.isArray(data) ? data : (data?.items ?? [])).filter(i => i.id != null);
  const out: Doc<"announcements">[] = [];
  const seen = new Set<string>();
  for (const i of listed.slice(0, 60)) {
    const itemId = String(i.id);
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    const n = await ctx.db
      .query("announcements")
      .withIndex("by_slug_item", q => q.eq("slug", account.slug).eq("itemId", itemId))
      .unique();
    if (!n) continue;
    const day = n.postedAt ? n.postedAt.slice(0, 10) : null;
    // The posting instant's UTC date is near enough for a window of weeks.
    if (day && (day < from || day > to)) continue;
    out.push(n);
  }
  return out.sort((a, b) => postedOf(b).localeCompare(postedOf(a)));
}

export const postedOf = (n: Doc<"announcements">) => n.postedAt ?? new Date(n.firstSeenAt).toISOString();

// ---------- laying assemblies over a day ----------

/**
 * The assemblies on a day that are for the student, newest notice first where two give the same one, each with its
 * times: the notice's own, else the times of the student's lessons in the periods it names.
 */
export function assembliesOn(day: string, notices: Doc<"announcements">[], account: Doc<"accounts">, lessons: Timed[]): DayAssembly[] {
  const year = yearOf(account.formGroup);
  const out: DayAssembly[] = [];
  const keys = new Set<string>();
  for (const n of notices) {
    (n.parsed?.assemblies ?? []).forEach((a, i) => {
      if (a.date !== day) return;
      const fit = forStudent(a, year);
      if (!fit.applies) return;
      let start = instantAt(day, a.start, account.slug);
      let finish = instantAt(day, a.end, account.slug);
      const taken = lessons.filter(l => l.period != null && a.periods.includes(l.period));
      if (taken.length && (!start || !finish)) {
        start ??= taken.map(l => l.start).sort()[0]!;
        finish ??= taken.map(l => l.finish).sort().pop()!;
      }
      if (start && finish && Date.parse(finish) <= Date.parse(start)) finish = null;
      // The same assembly in two notices (announced the day before, reminded on the day): the newer one stands.
      const key = start ?? (a.periods.length ? `p${a.periods.join(",")}` : a.title.toLowerCase());
      if (keys.has(key)) return;
      keys.add(key);
      out.push({
        id: `${n.itemId}#${i}`,
        title: a.title,
        start,
        finish,
        periods: a.periods,
        place: a.place,
        audience: audienceOf(a),
        notes: a.notes,
        maybe: fit.maybe || a.confidence === "low",
        notice: { id: n.itemId, title: n.title },
      });
    });
  }
  return out.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
}

/**
 * A notice's revised bell schedule for the day, as new times for the student's periods: only one Claude was sure of
 * (listed slot by slot) and that is for the student's year. The newest notice's schedule wins.
 */
function bellsOn(day: string, notices: Doc<"announcements">[], account: Doc<"accounts">) {
  const year = yearOf(account.formGroup);
  for (const n of notices) {
    const b = (n.parsed?.bells ?? []).find(b => b.date === day && b.confidence === "high");
    if (!b) continue;
    const fit = forStudent(b, year);
    if (!fit.applies || fit.maybe) continue;
    const times = new Map<number, { start: string; finish: string }>();
    for (const s of b.slots) {
      const start = instantAt(day, s.start, account.slug);
      const finish = instantAt(day, s.end, account.slug);
      if (s.period != null && start && finish && finish > start && !times.has(s.period)) times.set(s.period, { start, finish });
    }
    if (times.size) return times;
  }
  return null;
}

/**
 * A day's lessons with the notices laid over them: new times from a revised bell schedule (the timetable's own kept as
 * timesWas), and each lesson an assembly takes marked with it, the whole lesson or a part. Also the day's assemblies
 * for the student, for the day view to show at their times.
 */
export function layAssemblies<L extends Timed & { assembly?: LessonAssembly; timesWas?: { start: string; finish: string } }>(
  lessons: L[],
  day: string,
  notices: Doc<"announcements">[],
  account: Doc<"accounts">,
): { lessons: L[]; assemblies: DayAssembly[] } {
  if (!notices.some(n => n.parsed?.assemblies.some(a => a.date === day) || n.parsed?.bells.some(b => b.date === day))) {
    return { lessons, assemblies: [] };
  }
  const bells = bellsOn(day, notices, account);
  const timed = bells
    ? lessons.map(l => {
        const t = l.period != null ? bells.get(l.period) : undefined;
        return t && (t.start !== l.start || t.finish !== l.finish) ? { ...l, ...t, timesWas: { start: l.start, finish: l.finish } } : l;
      })
    : lessons;
  const assemblies = assembliesOn(day, notices, account, timed);
  const laid = timed.map(l => {
    const ls = Date.parse(l.start);
    const lf = Date.parse(l.finish);
    for (const a of assemblies) {
      const as = a.start ? Date.parse(a.start) : null;
      const af = a.finish ? Date.parse(a.finish) : null;
      let replaces: LessonAssembly["replaces"] | null = null;
      if (as != null && af != null) {
        if (Math.min(lf, af) - Math.max(ls, as) >= SLACK) replaces = as <= ls + SLACK && af >= lf - SLACK ? "whole" : "part";
      } else if (as != null) {
        // A start and no end: it is in the lesson if it starts during it.
        if (as >= ls - SLACK && as < lf - SLACK) replaces = "part";
      } else if (l.period != null && a.periods.includes(l.period)) {
        replaces = "whole";
      }
      if (replaces) {
        return { ...l, assembly: { id: a.id, title: a.title, start: a.start, finish: a.finish, place: a.place, replaces, maybe: a.maybe } };
      }
    }
    return l;
  });
  return { lessons: laid, assemblies };
}
