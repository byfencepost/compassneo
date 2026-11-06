import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { ConnectClass, ConnectNotice, SubjectGrade } from "@compassneo/connect";
import { connectRow, type StoredClass } from "../timetable";
import { connectClassFor } from "../classes";
import type { GradeSource } from "./grades";
import { matchSubject, shortName, type ClassInfo } from "./match";

/**
 * Which timetable class each graded subject, and each Connect class, is: the way home (overview.ts: the Grades row, the
 * to-do list) and a new mark's or new work's notification (convex/marks.ts) both see it.
 */

/**
 * Which timetable class each Connect class is, by Connect's class id: each current class finds its Connect class the
 * way the class panel does (lib/target.ts, connectClassFor).
 */
export async function connectCodes(ctx: QueryCtx, account: Doc<"accounts">, current: StoredClass[]) {
  const connectClasses = ((await connectRow(ctx, account._id, "classes"))?.data ?? []) as ConnectClass[];
  const notices = ((await connectRow(ctx, account._id, "notices"))?.data ?? []) as ConnectNotice[];
  const codeOf = new Map<number, string>();
  for (const c of current) {
    const k = connectClassFor(c.code, c.subject, c.teachers, connectClasses, notices);
    if (k && !codeOf.has(k.classId)) codeOf.set(k.classId, c.code);
  }
  return { connectClasses, codeOf };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The semester grades are shown for: the one wanted (the day's), or the only one there is (a new semester before Connect has it). */
export const shownSemester = (all: SubjectGrade[], wanted: 1 | 2): 1 | 2 => (all.some(g => g.semester === wanted) ? wanted : (all[0]?.semester ?? wanted));

/**
 * Every class on the timetable now picks its subject the way its card's grade does (classlist.ts). Homeroom is never a
 * subject (its teacher may teach one). Two classes picking one subject (shared teachers) go to the one whose name says
 * so, else the first. The other semester's subject is the same class where it has the same name; else a class picks it
 * only when the names agree too (strict), since the teacher of last semester's subject may well teach a different
 * class now.
 */
export function classesOfSubjects(
  all: SubjectGrade[],
  semester: 1 | 2,
  current: StoredClass[],
  source: GradeSource,
  subjectOfClass: (k: ClassInfo, pool: SubjectGrade[]) => SubjectGrade | null,
): Map<SubjectGrade, StoredClass> {
  const shown = all.filter(g => g.semester === semester);
  const rest = all.filter(g => g.semester !== semester);
  const classOf = new Map<SubjectGrade, StoredClass>();
  // By code, so "the first" is the same whoever asks.
  const classes = [...current].sort((a, b) => a.code.localeCompare(b.code));
  const named = (c: StoredClass, g: SubjectGrade) =>
    source === "canvas" ? subjectOfClass(c, [g]) === g : !!matchSubject({ code: c.code, subject: c.subject, teachers: [] }, [g]);
  const pick = (subjects: SubjectGrade[], strict: boolean) => {
    const picked = new Map<SubjectGrade, StoredClass[]>();
    for (const c of classes) {
      if (shortName(c.subject, c.code) === "Homeroom") continue;
      const g = subjectOfClass({ code: c.code, subject: c.subject, teachers: c.teachers }, subjects);
      if (g && (!strict || named(c, g))) picked.set(g, [...(picked.get(g) ?? []), c]);
    }
    for (const [g, cs] of picked) {
      if (classOf.has(g)) continue;
      const byName = cs.filter(c => named(c, g));
      classOf.set(g, byName.length === 1 ? byName[0]! : cs[0]!);
    }
  };
  pick(shown, false);
  for (const g of rest) {
    const twin = shown.find(s => squash(s.subject) === squash(g.subject));
    const c = twin && classOf.get(twin);
    if (c) classOf.set(g, c);
  }
  pick(
    rest.filter(g => !classOf.has(g)),
    true,
  );
  return classOf;
}
