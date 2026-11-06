import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "./live";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { motionMs } from "./schools";
import { signOutNotice } from "./session";

/**
 * The account's syncs (convex/sync.ts). Each run waits its turn in a pool on the server, then its steps run one after
 * another, Compass first, then Connect at a WA school; each lands in the run as it starts and ends. The app shows only
 * how far along a run is, and only for runs someone is watching (a sign-in, opening the app, "Sync now"): the quiet
 * ones (an open tab's five-minute sync, the background's) just move "Synced 2 minutes ago" on.
 */

export type SyncState = NonNullable<FunctionReturnType<typeof api.sync.latest>>;
export type SyncRun = NonNullable<SyncState["watched"]>;
export type SyncStep = SyncRun["steps"][number];
export type StepStatus = SyncStep["status"];

/**
 * A run still waiting for its job this long, or not heard from in ALIVE_STALE once going, is over as far as the screen
 * is concerned (the server lets it go at the same marks).
 */
const QUEUED_STALE = 30 * 60 * 1000;
const ALIVE_STALE = 10 * 60 * 1000;

/** Opening the app again after this long away counts as opening it: the gauge shows the sync it asks for. */
const AWAY = 15 * 60 * 1000;

/**
 * How often a tab in front of someone asks for a sync, give or take ACTIVE_JITTER. Each ask the server grants is a
 * run (a quick one: the week's timetable, tasks, news), and every row it changes runs the open queries again, so this
 * is kept to what a person would notice: a room change shows within five minutes.
 */
const ACTIVE_EVERY = 5 * 60 * 1000;
const ACTIVE_JITTER = 30 * 1000;
const nextAsk = () => ACTIVE_EVERY - ACTIVE_JITTER + Math.random() * 2 * ACTIVE_JITTER;

/** The latest watched run and the latest finished one. */
export const useSyncState = (token: string | null) => useQuery(api.sync.latest, { token });

/** The latest run someone is watching, finished or not: undefined while loading, null if there is none. */
export function useSyncRun(token: string | null) {
  const state = useSyncState(token);
  return state === undefined ? undefined : (state?.watched ?? null);
}

export const isRunning = (run: SyncRun | null | undefined): boolean =>
  !!run && !run.finishedAt && (run.aliveAt ? Date.now() - run.aliveAt < ALIVE_STALE : Date.now() - run.startedAt < QUEUED_STALE);

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

/**
 * Keeps the signed-in account synced while the app is open. On opening it asks for an "open" sync; then, while the tab
 * is in front of someone, an "active" one about every five minutes (ACTIVE_EVERY): first at a random point in the
 * first five, then every four and a half to five and a half, so devices opened together drift apart instead of asking
 * in step. A hidden tab asks nothing; shown again it asks at once (as an "open" after a quarter hour away, so the
 * gauge shows it). The server
 * decides what each ask gets: a full run, a quick one, or nothing (convex/sync.ts).
 *
 * If the account was forgotten behind this device's back (its stored login stopped working, maybe in a background sync),
 * the farewell it left says why, and the sign-in screen shows it. A guest's home (features/guest) keeps the guest's
 * account synced the same way, and hears of it going through onGone instead: it is not the device's own sign-in.
 */
export function useAutoSync(token: string | null, opts?: { onGone?: (message: string) => void }) {
  const syncNow = useMutation(api.sync.now);
  const farewell = useQuery(api.accounts.farewell, { token });
  const gone = useRef(opts?.onGone);
  useEffect(() => {
    gone.current = opts?.onGone;
  });

  useEffect(() => {
    if (!farewell) return;
    if (gone.current) gone.current(farewell.message);
    else signOutNotice.set(farewell.message);
  }, [farewell]);

  useEffect(() => {
    if (!token) return;
    let timer: number | undefined;
    let hiddenAt: number | null = null;

    const ask = (reason: "open" | "active") =>
      void syncNow({ token, reason })
        .then(r => {
          if (r.ok || (r.code !== "signed-out" && r.code !== "password-changed")) return;
          if (gone.current) gone.current(r.message);
          else signOutNotice.set(r.message);
        })
        .catch(() => {});
    const after = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        ask("active");
        after(nextAsk());
      }, ms);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        hiddenAt ??= Date.now();
        window.clearTimeout(timer);
        return;
      }
      const away = hiddenAt != null && Date.now() - hiddenAt > AWAY;
      hiddenAt = null;
      ask(away ? "open" : "active");
      after(nextAsk());
    };

    ask("open");
    if (document.visibilityState === "visible") after(Math.random() * ACTIVE_EVERY);
    else hiddenAt = Date.now();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, syncNow]);
}

/** A refresh that has not brought newer data in this long has failed quietly (Compass or Connect did not answer). */
const REFRESH_GIVE_UP = 90_000;

/**
 * When something the sync brings was last checked: its row's fetchedAt, or later, when one of its steps ("compass:news",
 * "connect:grades") came back done since. A row that comes back the same is not written again (the server's
 * lib/same.ts), so its own time can trail the last check. Undefined while there is no row.
 */
export function useChecked(token: string | null, fetchedAt: number | undefined, steps: string[]) {
  const checked = useSyncState(token)?.checked;
  if (fetchedAt == null) return undefined;
  return Math.max(fetchedAt, ...steps.map(k => checked?.[k] ?? 0));
}

/**
 * Refreshing something the sync brings and nothing else fetches (grades, notices): it starts a sync now, as "Sync now"
 * does, and counts as refreshing until the thing was checked after the ask (useChecked, with its steps), so it needs
 * nothing of the run but what it writes. The query updates by itself; after REFRESH_GIVE_UP it stops spinning either way.
 */
export function useSyncRefresh(token: string | null, fetchedAt: number | undefined, steps: string[]) {
  const syncNow = useMutation(api.sync.now);
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const checkedAt = useChecked(token, fetchedAt, steps);
  const landed = askedAt != null && checkedAt != null && checkedAt >= askedAt;
  useEffect(() => {
    if (askedAt == null) return;
    if (landed) return setAskedAt(null);
    const t = window.setTimeout(() => setAskedAt(null), REFRESH_GIVE_UP);
    return () => window.clearTimeout(t);
  }, [askedAt, landed]);
  const refresh = useCallback(async () => {
    if (!token) return;
    setAskedAt(Date.now());
    try {
      await syncNow({ token, force: true });
    } catch {
      // The query keeps the last answer; a failed refresh changes nothing on screen.
      setAskedAt(null);
    }
  }, [token, syncNow]);
  return { refresh, refreshing: askedAt != null && !landed };
}
