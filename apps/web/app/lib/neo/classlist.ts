import { useQuery } from "./live";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import type { Lesson } from "./timetable";

/**
 * Every class the student takes (convex/classlist.ts), for the list on home: colour, teacher, this semester's grade and
 * the next few lessons. undefined while loading.
 */
export type ListedClass = NonNullable<FunctionReturnType<typeof api.classlist.all>>[number];

export function useClassList(token: string | null, day: string) {
  return useQuery(api.classlist.all, token ? { token, day } : "skip");
}

/** The next lesson not over yet, if the kept days have one. */
export const nextOf = (c: ListedClass, now: number) => c.upcoming.find(u => Date.parse(u.finish) > now) ?? null;

/**
 * A class from the list as the class panel takes it: a lesson standing for the class (its next one where known), so
 * the panel's top draws at once while the class's detail loads. Its id says it is not a real lesson of the day.
 */
export function lessonOfClass(c: ListedClass, now: number): Lesson {
  const next = nextOf(c, now);
  return {
    id: `class:${c.code}`,
    code: c.code,
    name: c.name,
    subject: c.subject,
    start: next?.start ?? "",
    finish: next?.finish ?? "",
    period: null,
    room: next?.room ?? c.room,
    roomWas: null,
    teacher: c.teacher,
    teacherWas: null,
    hue: c.hue,
    grade: c.grade,
    tasks: [],
  };
}
