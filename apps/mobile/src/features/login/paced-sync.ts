import { useEffect, useState } from "react";
import type { SyncRun } from "@/lib/sync";

/** One step of the gauge per needle swing (the web's --dur-morph × 1.5), so a quick sync still sweeps and never jumps. */
export const PACE = 630;

const settled = (s: SyncRun["steps"][number]["status"]) => s === "done" || s === "failed" || s === "skipped";

/**
 * How far along the sync after a sign-in is, as the compass shows it: the run's settled steps out of all of them,
 * counted up one at a time at most once per PACE. A simpler take on the web's usePacedSync (lib/neo/sync.ts): steps
 * are counted wherever they are in the run, not only from the front, since a phone only needs the proportion.
 * `complete` once the run has finished and the gauge has caught up with it.
 */
export function usePacedSync(run: SyncRun | null | undefined) {
  const total = run?.steps.length ?? 0;
  const real = run ? run.steps.filter(s => settled(s.status)).length : 0;

  const [shown, setShown] = useState(0);
  const [forRun, setForRun] = useState(run?._id);
  // A different run (the sign-in's own, once it lands) starts the count again.
  if (run?._id !== forRun) {
    setForRun(run?._id);
    setShown(0);
  }

  useEffect(() => {
    if (shown >= real) return;
    const t = setTimeout(() => setShown(n => n + 1), PACE);
    return () => clearTimeout(t);
  }, [shown, real]);

  const complete = !!run?.finishedAt && shown >= total;
  return { progress: total ? Math.min(shown, total) / total : 0, complete };
}
