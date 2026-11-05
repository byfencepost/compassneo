import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted } from "./store";

export type School = { slug: string; name: string };
export type DirectoryHit = FunctionReturnType<typeof api.schools.directory>[number];

export const hostOf = (slug: string) => `${slug}.compass.education`;

/** An address inside a sentence, with non-breaking hyphens so it never wraps at thornlieshs-|wa. */
export const unbreakable = (host: string) => host.replace(/-/g, "‑");

// ---------- the schools this device has used ----------

const recentStore = persisted<School[]>("cneo.schools.recent.v1", []);
export const lastSchool = () => recentStore.get()[0] ?? null;
export const useRecentSchools = () => recentStore.use();
export function rememberSchool(s: School) {
  recentStore.set(prev => [s, ...prev.filter(p => p.slug !== s.slug)].slice(0, 5));
}

// ---------- Compass's directory, cached on the device ----------

type Cached = { at: number; items: DirectoryHit[] };
const DIRECTORY_TTL = 7 * 24 * 60 * 60 * 1000;
const directoryStore = persisted<Record<string, Cached>>("cneo.directory.v1", {});

const keyOf = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

function cachedDirectory(q: string): DirectoryHit[] | null {
  const hit = directoryStore.get()[keyOf(q)];
  return hit && Date.now() - hit.at < DIRECTORY_TTL ? hit.items : null;
}

function saveDirectory(q: string, items: DirectoryHit[]) {
  directoryStore.set(prev => {
    const next = { ...prev, [keyOf(q)]: { at: Date.now(), items } };
    const keys = Object.keys(next);
    // Keep the 60 newest searches.
    if (keys.length > 60) keys.sort((a, b) => next[a]!.at - next[b]!.at).slice(0, keys.length - 60).forEach(k => delete next[k]);
    return next;
  });
}

/**
 * Compass's school search for a name: the device's copy first, then Convex's (which keeps every answer for a week),
 * then Compass itself. A slower answer for an older query never replaces a newer one.
 */
export function useDirectory(q: string): { items: DirectoryHit[]; pending: boolean } {
  const search = useAction(api.schools.directory);
  const key = keyOf(q);
  const [state, setState] = useState<{ key: string; items: DirectoryHit[] }>({ key: "", items: [] });
  const [pending, setPending] = useState(false);
  const latest = useRef("");

  useEffect(() => {
    latest.current = key;
    if (key.length < 3) {
      setState({ key, items: [] });
      setPending(false);
      return;
    }
    const cached = cachedDirectory(key);
    if (cached) {
      setState({ key, items: cached });
      setPending(false);
      return;
    }
    setPending(true);
    search({ q: key })
      .then(items => {
        saveDirectory(key, items);
        if (latest.current === key) setState({ key, items });
      })
      .catch(() => {
        if (latest.current === key) setState({ key, items: [] });
      })
      .finally(() => {
        if (latest.current === key) setPending(false);
      });
  }, [key, search]);

  return { items: state.key === key ? state.items : [], pending };
}

/** The value, once it has stopped changing for ms. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** The Australian state the browser's time zone suggests, so slug guesses try it first. */
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

/** Reads a motion token in ms from the page, so code waits exactly as long as the CSS animation (0 under reduced motion). */
export function motionMs(token: string): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.body).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith("ms") ? n : n * 1000;
}
