import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { GradeTask, SubjectGrade } from "@compassneo/connect";
import { notify, told, type Push } from "./push";
import { nudgeClassmates } from "./classmates";
import { addDays, dayOf, schoolToday, schoolZone } from "./lib/days";
import { historyKey, type History, type MarkSeen } from "./lib/history";
import { currentClasses } from "./lib/courses";
import { subjectMatcher, type GradeSource } from "./lib/grades";
import { classesOfSubjects, shownSemester } from "./lib/subjects";
import { shortName } from "./lib/match";
import { semesterOf } from "./timetable";

/**
 * Telling a student what their own syncs find new (push.ts has the rest of the notifications):
 *   marks  a mark or result back: a Compass learning task's result (work.ts keepTasks), a Connect or Canvas grade (the
 *          grade history, lib/history.ts: connect.ts store, canvas.ts keepGrades)
 *   work   new work set: a Compass learning task, a Connect submission (work.ts storeBoard), a Canvas assignment
 *          (canvas.ts keepWork)
 * Each is found by the mutation that keeps what it is in, against what was kept before, so it is told the once (and
 * pushLog keeps it told if it is ever found again). Nothing is told on an account's first fetch of a thing (no row
 * before is the baseline), nor for marks already there when the history began, nor for work already past its date.
 * What one fetch finds is told as one notification per class ("3 new marks in Maths", with the class's code, which
 * counts against that class's share of the day: push.ts notify), and a fetch that finds a great many is taken as
 * Compass or Canvas showing again what it had left out, not as news.
 *
 * A mark that is new to the class (not a mark changed for one student) also asks the student's classmates on Compass
 * Neo to sync now (convex/classmates.ts), so they hear of their own.
 */

/** More than this many new in one fetch reads as a re-read (a list that came back short, then whole), not as news. */
const BURST = 12;
/** Work set longer ago than this, newly seen, is not news either (an old task brought back on to the list). */
const NEW_WORK_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

/** A mark newly back, as the mutation that kept it found it. */
export type NewMark = {
  /** What it is, for pushLog ("mark:compass:4893"): told once, ever. */
  key: string;
  /** The timetable class it is in, when one matches. */
  code: string | null;
  /** What the class is called ("Maths"), else what its own side calls it. */
  className: string;
  task: string;
  /** As the student sees it: "18/20 (90%)", "B+". */
  result: string;
  /** A teacher changed a mark already there (one student's): told, but no classmate is asked. */
  changed?: boolean;
  /** What was marked, the same for every student in the class ("compass:4893"), for the classmates' nudge. */
  shared: string | null;
};

/** New work set, as the mutation that kept it found it. */
export type NewWork = { key: string; code: string | null; className: string; task: string; due: string | null };

/** What a notification calls a class: what its card does ("Maths"). */
export const shortClass = (c: { code: string; subject: string | null }) => shortName(c.subject, c.code);

/** Too many at once to be news (BURST). */
export const tooMany = (found: unknown[]) => found.length > BURST;

/** Whether work newly seen is news: not past its date, and (when the side says when it was set) set lately. */
export const isNewWork = (due: string | null, setAt: string | null, now: number) =>
  (!due || Date.parse(due) > now) && (!setAt || !(now - Date.parse(setAt) > NEW_WORK_DAYS * DAY));

// ---------- wording ----------

const num = (n: number) => String(Math.round(n * 100) / 100);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** "18/20 (90%)", or the mark alone when it is out of nothing known. */
export function markText(mark: number, max: number | null) {
  if (!finite(max) || max <= 0) return num(mark);
  return `${num(mark)}/${num(max)} (${Math.round((100 * mark) / max)}%)`;
}

/** Compass's own words for a result, with its percent when it is a score ("18/20" is "18/20 (90%)"). */
export function resultText(result: string) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(result);
  return m ? markText(Number(m[1]), Number(m[2])) : result.trim();
}

/** "due today", "due tomorrow", "due Fri 13 Nov", at the school. */
export function dueText(due: string, slug: string, now: number) {
  const day = dayOf(due, slug);
  const today = schoolToday(slug);
  if (day === today) return "due today";
  if (day === addDays(today, 1)) return "due tomorrow";
  const parts = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: schoolZone(slug) }).formatToParts(
    new Date(Date.parse(due) || now),
  );
  const part = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `due ${part("weekday")} ${part("day")} ${part("month")}`;
}

const classUrl = (code: string, tab: "grades" | "work") => `/class/${encodeURIComponent(code)}?tab=${tab}`;

/** The one class every item is in, when they all are in one. */
function oneClass<T extends { code: string | null; className: string }>(items: T[]) {
  const first = items[0]!;
  return items.every(x => x.code === first.code && x.className === first.className) ? first : null;
}

/**
 * What one fetch found, a group per timetable class (each class has its own share of the day's notifications: push.ts),
 * and one more for whatever matched no class.
 */
function byClass<T extends { code: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const x of items) groups.set(x.code ?? "", [...(groups.get(x.code ?? "") ?? []), x]);
  return [...groups.values()];
}

function marksPush(marks: NewMark[], tab: "grades" | "work"): Push {
  const one = oneClass(marks);
  const about = one?.code ? { url: classUrl(one.code, tab), code: one.code } : { url: "/grades" };
  if (marks.length === 1) {
    const m = marks[0]!;
    return { kind: "marks", title: m.changed ? `Mark changed in ${m.className}` : `New mark in ${m.className}`, body: `${m.task}: ${m.result}`, ...about };
  }
  return {
    kind: "marks",
    title: one ? `${marks.length} new marks in ${one.className}` : `${marks.length} new marks`,
    body: marks.map(m => (one ? `${m.task}: ${m.result}` : `${m.className}: ${m.task}, ${m.result}`)).join(" · "),
    ...about,
  };
}

function workPush(work: NewWork[], slug: string, now: number): Push {
  const one = oneClass(work);
  const about = one?.code ? { url: classUrl(one.code, "work"), code: one.code } : { url: "/todo" };
  const what = (w: NewWork) => (w.due ? `${w.task}, ${dueText(w.due, slug, now)}` : w.task);
  if (work.length === 1) return { kind: "work", title: `New work in ${work[0]!.className}`, body: what(work[0]!), ...about };
  return {
    kind: "work",
    title: one ? `${work.length} new tasks in ${one.className}` : `${work.length} new tasks`,
    body: work.map(w => (one ? what(w) : `${w.className}: ${what(w)}`)).join(" · "),
    ...about,
  };
}

// ---------- telling ----------

/**
 * Tells a group as one notification under its first key, and marks the rest of the keys told too, so none of them is
 * told again on its own. (push.ts notify takes one key; the others go straight into its log as told but not sent, so
 * they never count against the day's budget twice.)
 */
async function tellAll(ctx: MutationCtx, account: Doc<"accounts">, keys: string[], push: Push) {
  const [first, ...rest] = keys;
  if (!first || !(await notify(ctx, account._id, first, push))) return;
  const at = Date.now();
  const day = schoolToday(account.slug);
  for (const key of rest) {
    await ctx.db.insert("pushLog", { accountId: account._id, key, at, day, kind: push.kind, ...(push.code ? { code: push.code } : {}), sent: false });
  }
}

/** The ones not told before, each once (a fetch can list a thing twice). */
async function untold<T extends { key: string }>(ctx: MutationCtx, account: Doc<"accounts">, found: T[]) {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const f of found) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    if (!(await told(ctx, account._id, f.key))) out.push(f);
  }
  return out;
}

/**
 * Tells the student of marks newly back (tab: where in the class they show), and asks their classmates to look for
 * theirs. Classmates are asked even for a mark told already (a fetch racing another): the nudge is once per school and
 * mark however often it is asked for.
 */
export async function tellMarks(ctx: MutationCtx, account: Doc<"accounts">, marks: NewMark[], tab: "grades" | "work") {
  if (!marks.length) return;
  for (const group of byClass(await untold(ctx, account, marks))) await tellAll(ctx, account, group.map(m => m.key), marksPush(group, tab));
  await nudgeClassmates(
    ctx,
    account,
    marks.flatMap(m => (m.code && m.shared && !m.changed ? [{ code: m.code, shared: m.shared }] : [])),
  );
}

/** Tells the student of new work set. */
export async function tellWork(ctx: MutationCtx, account: Doc<"accounts">, work: NewWork[]) {
  if (!work.length) return;
  const now = Date.now();
  for (const group of byClass(await untold(ctx, account, work))) await tellAll(ctx, account, group.map(w => w.key), workPush(group, account.slug, now));
}

/**
 * Marks the grade history says came in on this fetch (dated now, not baseline: lib/history.ts recordGrades), from
 * Connect (connect.ts store) or Canvas (canvas.ts keepGrades), each with the timetable class its subject is (as the
 * Grades row on home has it, lib/subjects.ts). A mark a teacher changed is told as changed.
 */
export async function tellGrades(ctx: MutationCtx, account: Doc<"accounts">, source: GradeSource, subjects: SubjectGrade[], history: History, now: number) {
  const found: Array<{ g: SubjectGrade; t: GradeTask & { mark: number }; seen: MarkSeen }> = [];
  for (const g of subjects) {
    const h = history.subjects[historyKey(g.semester, g.subject)];
    for (const t of g.tasks) {
      const seen = h?.marks[String(t.taskId)];
      if (seen && seen.at === now && !seen.baseline && finite(t.mark)) found.push({ g, t: t as GradeTask & { mark: number }, seen });
    }
  }
  if (!found.length) return;

  const current = await currentClasses(ctx, account);
  const semester = shownSemester(subjects, semesterOf(schoolToday(account.slug)));
  const classOf = classesOfSubjects(subjects, semester, current, source, await subjectMatcher(ctx, account, source));
  const marks: NewMark[] = found.map(({ g, t, seen }) => {
    const c = classOf.get(g);
    const changed = seen.was !== undefined;
    const base = `mark:${source}:${historyKey(g.semester, g.subject)}:${t.taskId}`;
    return {
      key: changed ? `${base}:${t.mark}` : base,
      code: c?.code ?? null,
      className: c ? shortClass(c) : shortClass({ code: g.subject, subject: g.subject }),
      task: t.name,
      result: changed && finite(seen.was) ? `${markText(t.mark, t.maximumMark)}, was ${num(seen.was)}` : markText(t.mark, t.maximumMark),
      changed,
      shared: changed ? null : `${source}:${t.taskId}`,
    };
  });
  await tellMarks(ctx, account, marks, "grades");
}
