import { useState, useSyncExternalStore } from "react";
import { useQuery as useCachedQuery } from "convex-helpers/react/cache/hooks";
import type { OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";

/**
 * The app's useQuery: convex-helpers' cached one (lib/neo/backend.tsx), which also lets go of its subscriptions once
 * the tab has been out of sight for ASLEEP_AFTER.
 *
 * Every live query runs again on the server whenever a row it read changes, whether anyone is looking or not, and a
 * tab left open behind others all day keeps every query it ever opened live. Asleep, each query here asks for nothing
 * (the cache lets the subscription go after its own five minutes) and keeps handing back what it last had, so the page
 * looks the same. Back in sight, each asks again at once, and shows what it had until the new answer lands.
 */

/** A tab out of sight this long stops listening. Short absences (another tab for a minute) change nothing. */
const ASLEEP_AFTER = 3 * 60 * 1000;

let asleep = false;
let timer: number | undefined;
const listeners = new Set<() => void>();

function setAsleep(next: boolean) {
  if (next === asleep) return;
  asleep = next;
  for (const l of listeners) l();
}

function onVisibility() {
  window.clearTimeout(timer);
  if (document.visibilityState === "visible") setAsleep(false);
  else timer = window.setTimeout(() => setAsleep(true), ASLEEP_AFTER);
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearTimeout(timer);
  };
}

const useAsleep = () =>
  useSyncExternalStore(
    subscribe,
    () => asleep,
    () => false,
  );

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const sleeping = useAsleep();
  const key = args[0] === "skip" ? null : JSON.stringify(args[0] ?? {});
  const live = useCachedQuery(query, ...((sleeping ? ["skip"] : args) as OptionalRestArgsOrSkip<Query>));
  const [kept, setKept] = useState<{ key: string | null; value: FunctionReturnType<Query> } | null>(null);
  // An answer is the same object until it changes, so this settles after one pass.
  if (!sleeping && live !== undefined && (kept?.value !== live || kept.key !== key)) setKept({ key, value: live });
  // Asleep, or just woken and still waiting: what it last had for these same arguments.
  if (live === undefined && key !== null && kept?.key === key) return kept.value;
  return live;
}
