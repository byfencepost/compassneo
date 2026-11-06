import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted, useStored } from "./store";

export { normalizeSlug, looksLikeSlug } from "@compassneo/compass/school";

export type School = { slug: string; name: string };
export type DirectoryHit = FunctionReturnType<typeof api.schools.directory>[number];

export const hostOf = (slug: string) => `${slug}.compass.education`;

// ---------- the schools this phone has used ----------

const recentStore = persisted<School[]>("cneo.schools.recent.v1", []);
export const lastSchool = () => recentStore.get()[0] ?? null;
export const useRecentSchools = () => useStored(recentStore);
export function rememberSchool(s: School) {
  recentStore.set(prev => [s, ...prev.filter(p => p.slug !== s.slug)].slice(0, 5));
}

// ---------- Compass's directory ----------

const keyOf = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Compass's school search for a name, through Convex (which keeps every answer for a week). A slower answer for an
 * older query never replaces a newer one.
 */
export function useDirectory(q: string): { items: DirectoryHit[]; pending: boolean } {
  const search = useAction(api.schools.directory);
  const key = keyOf(q);
  // The answer and the query it answers: anything else on screen is still pending.
  const [answer, setAnswer] = useState<{ key: string; items: DirectoryHit[] }>({ key: "", items: [] });
  const latest = useRef("");

  useEffect(() => {
    latest.current = key;
    if (key.length < 3) return;
    search({ q: key })
      .then(items => latest.current === key && setAnswer({ key, items }))
      .catch(() => latest.current === key && setAnswer({ key, items: [] }));
  }, [key, search]);

  if (key.length < 3) return { items: [], pending: false };
  return answer.key === key ? { items: answer.items, pending: false } : { items: [], pending: true };
}

/** The value, once it has stopped changing for ms. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** The Australian state the phone's time zone suggests, so slug guesses try it first. */
export function regionHint(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const map: Record<string, string> = {
      "Australia/Melbourne": "vic",
      "Australia/Perth": "wa",
      "Australia/Adelaide": "sa",
      "Australia/Sydney": "nsw",
      "Australia/Brisbane": "qld",
      "Australia/Darwin": "nt",
      "Australia/Hobart": "tas",
    };
    return map[tz];
  } catch {
    return undefined;
  }
}
