import type { Palette } from "@/theme/tokens";
import type { Assessment, SemesterGrade, Spread } from "./data";

/**
 * The grade's arithmetic, ported from the web (apps/web/app/lib/neo/classes.ts): the running grade task by task, what
 * the weighting still allows, and where a mark sits in its class. Pure, so the screens only draw.
 */

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** A number as a grade reads: one decimal where it has one, "82.5", "80". */
export const pct = (n: number) => (Math.round(n * 10) / 10).toString();

/** A grade's colour: green from 80, Neo blue from 65, amber from 50, coral under (the web's donut). */
export type GradeTone = "ok" | "neo" | "warn" | "fail";
export const toneOf = (percent: number): GradeTone => (percent >= 80 ? "ok" : percent >= 65 ? "neo" : percent >= 50 ? "warn" : "fail");

/** The tone as text on the page. */
export const toneText = (percent: number, c: Palette) => ({ ok: c.okText, neo: c.neoText, warn: c.warnText, fail: c.failText })[toneOf(percent)];

/** The tone as a solid fill (a bar, a ring). */
export const toneFill = (percent: number, c: Palette) => ({ ok: c.ok, neo: c.neo, warn: c.warn, fail: c.fail })[toneOf(percent)];

export type Step = { task: Assessment; index: number; grade: number; own: number | null };

/** A subject's score after each marked task, in the outline's order: how the grade got to where it is. */
export function runningGrade(tasks: Assessment[]): Step[] {
  let earned = 0;
  let out = 0;
  let raw = 0;
  let rawOut = 0;
  const steps: Step[] = [];
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
 * What the weighting says: the points banked so far, the points still to be marked, and the range the final grade can
 * still land in (nothing more scored, or full marks on the rest). Null when Connect gives no weights.
 */
export function standing(g: SemesterGrade) {
  const total = g.totalWeight;
  if (!finite(total) || total <= 0) return null;
  const marked = g.tasks.filter(t => finite(t.mark) && finite(t.weightedMark) && finite(t.weight));
  const earned = marked.reduce((s, t) => s + t.weightedMark!, 0);
  const markedWeight = marked.reduce((s, t) => s + t.weight!, 0);
  const left = Math.max(0, total - markedWeight);
  return { total, earned, left, floor: (100 * earned) / total, ceiling: (100 * (earned + left)) / total };
}

export type RankTone = "ok" | "neo" | "neutral" | "warn";
export type Rank = { label: string; phrase: string; tone: RankTone; percentile: number; quarter: 0 | 1 | 2 | 3 };

/**
 * Where a mark sits in its class, from Connect's chart (the lowest and highest marks, the quartiles and the median; no
 * rank as such). The percentile is read off those five points in a straight line between each, so it is an estimate.
 * Marks are compared to a tenth, the way Connect rounds them.
 */
export function rankOf(mark: number, s: Spread): Rank {
  const at = (x: number) => Math.round(x * 10) / 10;
  const m = at(mark);
  const knots: [number, number][] = [
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
  if (m >= at(s.median)) return { label: "Top half", phrase: "Top half of the class", tone: "neo", percentile, quarter: 2 };
  if (m > at(s.q1)) return { label: "Bottom half", phrase: "Bottom half of the class", tone: "neutral", percentile, quarter: 1 };
  return { label: "Bottom 25%", phrase: "Bottom 25% of the class", tone: "warn", percentile, quarter: 0 };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The assessment a piece of work is, by name: Compass's tasks, Connect's submissions and Connect's outline are kept
 * apart, so the names are all that tie them. The same name wins; else one name holding the other, when the shorter is
 * long enough to mean something. Only a marked assessment with its class's results counts.
 */
export function assessmentFor(name: string, tasks: Assessment[]): (Assessment & { percent: number; spread: Spread }) | null {
  const ready = tasks.filter((t): t is Assessment & { percent: number; spread: Spread } => t.mark != null && t.percent != null && t.spread != null);
  const n = squash(name);
  if (n.length < 3) return null;
  const same = ready.find(t => squash(t.name) === n);
  if (same) return same;
  const near = ready.filter(t => {
    const a = squash(t.name);
    const short = a.length < n.length ? a : n;
    return short.length >= 8 && (a.includes(n) || n.includes(a));
  });
  return near.length === 1 ? near[0]! : null;
}

export type Change = { at: number; from: number | null; to: number | null; tasks: Assessment[] };

/** Each time a sync saw the grade move or a mark arrive, newest first (the web's grade-history.tsx). */
export function changesOf(g: SemesterGrade): Change[] {
  const times = new Set<number>();
  for (const p of g.points) if (!p.baseline) times.add(p.at);
  for (const t of g.tasks) if (t.markedAt) times.add(t.markedAt);
  return [...times]
    .sort((a, b) => b - a)
    .map(at => {
      const i = g.points.findIndex(p => p.at === at);
      return {
        at,
        from: i > 0 ? (g.points[i - 1]!.percent ?? null) : null,
        to: i >= 0 ? (g.points[i]!.percent ?? null) : null,
        tasks: g.tasks.filter(t => t.markedAt === at),
      };
    });
}
