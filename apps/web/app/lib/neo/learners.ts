import { useAction } from "convex/react";
import { useQuery } from "./live";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { useLoadOnce } from "./loads";

/**
 * A class's learners (convex/learners.ts): everyone in it on Connect, the student first, each with the photo they
 * chose on Connect (photoUrl, through Compass Neo's file route) or none. Compass refuses class lists to students, so a
 * class that is not on Connect has learners { status: "none" }.
 */

export type ClassLearners = NonNullable<FunctionReturnType<typeof api.learners.forClass>>;
export type Classmate = Extract<ClassLearners["learners"], { status: "ready" }>["data"][number];

export function useClassLearners(token: string | null, code: string | null) {
  const data = useQuery(api.learners.forClass, token && code ? { token, code } : "skip");
  const load = useAction(api.learners.load);
  useLoadOnce(token && code ? `learners:${code}` : null, () => load({ token: token!, code: code! }), 30 * 60_000);
  return data;
}
