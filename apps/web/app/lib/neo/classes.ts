import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";

/**
 * One class, everything about it (convex/classes.ts): its lessons in the weeks around the day being looked at, its
 * teachers, both semesters of grades with every assessment and the grade's history, learning tasks and notices.
 */

export type ClassDetail = NonNullable<FunctionReturnType<typeof api.classes.detail>>;
export type ClassGrades = ClassDetail["grades"];
export type SemesterGrade = NonNullable<Extract<ClassGrades, { status: "ready" }>["current"]>;
export type Assessment = SemesterGrade["tasks"][number];
export type ClassLesson = ClassDetail["lessons"][number];
export type ClassTask = ClassDetail["tasks"][number];
export type ClassNotice = ClassDetail["notices"][number];

export function useClassDetail(token: string | null, code: string | null, day: string): ClassDetail | null | undefined {
  return useQuery(api.classes.detail, token && code ? { token, code, day } : "skip");
}

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** A subject's score after each marked task, in the outline's order: how the grade got to where it is. */
export function runningGrade(tasks: Assessment[]) {
  let earned = 0;
  let out = 0;
  let raw = 0;
  let rawOut = 0;
  const steps: Array<{ task: Assessment; index: number; grade: number; own: number | null }> = [];
  tasks.forEach((t, index) => {
    if (!finite(t.mark)) return;
    if (finite(t.weightedMark) && finite(t.weight) && t.weight > 0) {
      earned += t.weightedMark;
      out += t.weight;
    }
    if (finite(t.max) && t.max > 0) {
      raw += t.mark;
      rawOut += t.max;
    }
    const grade = out > 0 ? (100 * earned) / out : rawOut > 0 ? (100 * raw) / rawOut : null;
    if (grade != null) steps.push({ task: t, index, grade, own: t.percent });
  });
  return steps;
}

/**
 * What the weighting says: the points banked so far, the points lost, the points still to be marked, and the range the
 * final grade can still land in (nothing more scored, or full marks on the rest). Null when Connect gives no weights.
 */
export function standing(g: SemesterGrade) {
  const total = g.totalWeight;
  if (!finite(total) || total <= 0) return null;
  const marked = g.tasks.filter(t => finite(t.mark) && finite(t.weightedMark) && finite(t.weight));
  const earned = marked.reduce((s, t) => s + t.weightedMark!, 0);
  const markedWeight = marked.reduce((s, t) => s + t.weight!, 0);
  const left = Math.max(0, total - markedWeight);
  return {
    total,
    earned,
    lost: Math.max(0, markedWeight - earned),
    left,
    floor: (100 * earned) / total,
    ceiling: (100 * (earned + left)) / total,
  };
}

export type Spread = NonNullable<SemesterGrade["spread"]>;

export type RankTone = "ok" | "todo" | "muted" | "warn";
export type Rank = { label: string; phrase: string; tone: RankTone; percentile: number; quarter: 0 | 1 | 2 | 3 };

/**
 * Where a mark sits in its class, from Connect's chart (it gives no rank as such, only the lowest and highest marks, the
 * quartiles and the median). The percentile is read off those five points in a straight line between each, so it is
 * an estimate: "ahead of about 78%". Marks are compared to a tenth, the way Connect rounds them.
 */
export function rankOf(mark: number, s: Spread): Rank {
  const at = (x: number) => Math.round(x * 10) / 10;
  const m = at(mark);
  const knots: Array<[number, number]> = [
    [at(s.min), 0],
    [at(s.q1), 25],
    [at(s.median), 50],
    [at(s.q3), 75],
    [at(s.max), 100],
  ];
  let percentile = m <= knots[0]![0] ? 0 : 100;
  for (let i = 1; i < knots.length; i++) {
    const [x0, p0] = knots[i - 1]!;
    const [x1, p1] = knots[i]!;
    if (m <= x1) {
      percentile = x1 > x0 ? p0 + ((m - x0) / (x1 - x0)) * (p1 - p0) : p1;
      break;
    }
  }
  percentile = Math.round(percentile);
  if (m >= at(s.max)) return { label: "Top mark", phrase: "Top mark in the class", tone: "ok", percentile: 100, quarter: 3 };
  if (m >= at(s.q3)) return { label: "Top 25%", phrase: "Top 25% of the class", tone: "ok", percentile, quarter: 3 };
  if (m >= at(s.median)) return { label: "Top half", phrase: "Top half of the class", tone: "todo", percentile, quarter: 2 };
  if (m > at(s.q1)) return { label: "Bottom half", phrase: "Bottom half of the class", tone: "muted", percentile, quarter: 1 };
  return { label: "Bottom 25%", phrase: "Bottom 25% of the class", tone: "warn", percentile, quarter: 0 };
}

const squashName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The assessment a piece of work is, by name: Compass's learning task or Connect's submission and Connect's assessment
 * outline are kept apart, so the names are all that tie them. The same name (ignoring case, spaces and punctuation)
 * wins; else one name holding the other, when the shorter is long enough to mean something. Only a marked assessment
 * with its class's results counts, since that is what the work's page shows.
 */
export function assessmentFor(name: string, tasks: Assessment[]): (Assessment & { percent: number; spread: Spread }) | null {
  const ready = tasks.filter((t): t is Assessment & { percent: number; spread: Spread } => t.mark != null && t.percent != null && t.spread != null);
  const n = squashName(name);
  if (n.length < 3) return null;
  const same = ready.find(t => squashName(t.name) === n);
  if (same) return same;
  const near = ready.filter(t => {
    const a = squashName(t.name);
    const short = a.length < n.length ? a : n;
    return short.length >= 8 && (a.includes(n) || n.includes(a));
  });
  return near.length === 1 ? near[0]! : null;
}

/** A number as a grade reads: one decimal where it has one, "82.5", "80". */
export const pct = (n: number) => (Math.round(n * 10) / 10).toString();
