import { useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { motionMs } from "./schools";

/**
 * The account's latest sync (convex/sync.ts). Steps run one after another on the server, Compass first, then Connect
 * at a WA school; each lands in the run as it starts and ends. The app shows only how far along it is.
 */

export type SyncRun = NonNullable<FunctionReturnType<typeof api.sync.latest>>;
export type SyncStep = SyncRun["steps"][number];
export type StepStatus = SyncStep["status"];

/** A run with no word for this long died with its server action (the server gives up on it at three minutes). */
const STALE = 3 * 60 * 1000;

export const useSyncRun = (token: string | null) => useQuery(api.sync.latest, { token });

export const isRunning = (run: SyncRun | null | undefined): boolean =>
  !!run && !run.finishedAt && Date.now() - run.startedAt < STALE;

const settled = (s: StepStatus) => s === "done" || s === "failed" || s === "skipped";

/**
 * How far along the run is, as the screen shows it: steps count as settled one at a time, at most one per pace (the
 * needle's swing), so a sync quicker than the eye still sweeps the gauge smoothly instead of jumping to the end.
 */
export function usePacedSync(run: SyncRun | null | undefined) {
  const total = run?.steps.length ?? 0;
  let real = 0;
  while (run && real < total && settled(run.steps[real].status)) real++;

  const [shown, setShown] = useState(0);
  const [forRun, setForRun] = useState(run?._id);
  if (run?._id !== forRun) {
    setForRun(run?._id);
    setShown(0);
  }

  useEffect(() => {
    if (shown >= real) return;
    const pace = motionMs("--dur-morph") * 1.5;
    const t = window.setTimeout(() => setShown(n => n + 1), pace);
    return () => window.clearTimeout(t);
  }, [shown, real]);

  const complete = !!run?.finishedAt && shown >= total;
  return { progress: total ? shown / total : 0, complete };
}
