import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";

/**
 * Every class the student takes (convex/classlist.ts), for the list on home, as the web reads it
 * (apps/web/app/lib/neo/classlist.ts): colour, teacher, this semester's grade and the next few lessons. undefined while
 * loading.
 */
export type ListedClass = NonNullable<FunctionReturnType<typeof api.classlist.all>>[number];

export function useClassList(token: string | null, day: string) {
  return useQuery(api.classlist.all, token ? { token, day } : "skip");
}

/** The class's next lesson not over yet, if the kept days have one. */
export const nextOf = (c: ListedClass, now: number) => c.upcoming.find(u => Date.parse(u.finish) > now) ?? null;
