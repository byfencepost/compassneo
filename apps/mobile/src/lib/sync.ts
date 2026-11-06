import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { signOutNotice } from "./notice";
import { endGuest } from "./guest";

/**
 * The account's syncs (convex/sync.ts), as the web app reads them (apps/web/app/lib/neo/sync.ts). Each run waits its
 * turn in a pool on the server, then its steps run one after another. The phone asks the way an open tab does: once on
 * opening, then about once a minute while the app is in front of someone, and at once when it comes back. The server
 * decides what each ask gets: a full run, a quick one, or nothing.
 */

export type SyncState = NonNullable<FunctionReturnType<typeof api.sync.latest>>;
export type SyncRun = NonNullable<SyncState["watched"]>;

const QUEUED_STALE = 30 * 60 * 1000;
const ALIVE_STALE = 10 * 60 * 1000;
/** Coming back after this long away counts as opening the app. */
const AWAY = 15 * 60 * 1000;

/** The latest watched run and the latest finished one. */
export const useSyncState = (token: string | null) => useQuery(api.sync.latest, { token });

/** The latest run someone is watching: undefined while loading, null if there is none. */
export function useSyncRun(token: string | null) {
  const state = useSyncState(token);
  return state === undefined ? undefined : (state?.watched ?? null);
}

export const isRunning = (run: SyncRun | null | undefined): boolean =>
  !!run && !run.finishedAt && (run.aliveAt ? Date.now() - run.aliveAt < ALIVE_STALE : Date.now() - run.startedAt < QUEUED_STALE);

/**
 * How often the app in front of someone asks for a sync, give or take ACTIVE_JITTER (as the web's lib/neo/sync.ts).
 * Each ask the server grants is a run, and every row it changes runs the open queries again.
 */
const ACTIVE_EVERY = 5 * 60 * 1000;
const ACTIVE_JITTER = 30 * 1000;
const nextAsk = () => ACTIVE_EVERY - ACTIVE_JITTER + Math.random() * 2 * ACTIVE_JITTER;

/**
 * Keeps the signed-in account synced while the app is open, and hears it if the account was forgotten. With `guest`,
 * the guest's account (lib/guest.ts) instead: their session gone (it ran out, their password changed) just ends guest
 * mode, and says nothing on the sign-in screen, since the phone's own sign-in is fine.
 */
export function useAutoSync(token: string | null, opts?: { guest?: boolean }) {
  const guest = !!opts?.guest;
  const syncNow = useMutation(api.sync.now);
  const farewell = useQuery(api.accounts.farewell, { token });

  useEffect(() => {
    if (!farewell) return;
    if (guest) endGuest();
    else signOutNotice.set(farewell.message);
  }, [farewell, guest]);

  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let awayAt: number | null = null;

    const ask = (reason: "open" | "active") =>
      void syncNow({ token, reason })
        .then(r => {
          if (r.ok || (r.code !== "signed-out" && r.code !== "password-changed")) return;
          if (guest) endGuest();
          else signOutNotice.set(r.message);
        })
        .catch(() => {});
    const after = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (AppState.currentState !== "active") return;
        ask("active");
        after(nextAsk());
      }, ms);
    };

    ask("open");
    after(Math.random() * ACTIVE_EVERY);
    const sub = AppState.addEventListener("change", state => {
      if (state !== "active") {
        awayAt ??= Date.now();
        clearTimeout(timer);
        return;
      }
      const away = awayAt != null && Date.now() - awayAt > AWAY;
      awayAt = null;
      ask(away ? "open" : "active");
      after(nextAsk());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [token, syncNow, guest]);
}

/** A refresh that has not brought newer data in this long has failed quietly. */
const REFRESH_GIVE_UP = 90_000;

/**
 * When something the sync brings was last checked: its row's fetchedAt, or later, when one of its steps
 * ("compass:news", "connect:grades") came back done since.
 */
export function useChecked(token: string | null, fetchedAt: number | undefined, steps: string[]) {
  const checked = useSyncState(token)?.checked;
  if (fetchedAt == null) return undefined;
  return Math.max(fetchedAt, ...steps.map(k => checked?.[k] ?? 0));
}

/**
 * Pull to refresh for something the sync brings: starts a sync now, and counts as refreshing until the thing was
 * checked after the ask (or REFRESH_GIVE_UP passes). With no fetchedAt/steps it refreshes until the run finishes.
 */
export function useSyncRefresh(token: string | null, fetchedAt?: number, steps: string[] = []) {
  const syncNow = useMutation(api.sync.now);
  const state = useSyncState(token);
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const checkedAt = useChecked(token, fetchedAt, steps);
  const lastDone = state?.watched?.finishedAt ?? 0;
  const landed = askedAt != null && (fetchedAt != null ? checkedAt != null && checkedAt >= askedAt : lastDone >= askedAt);
  useEffect(() => {
    if (askedAt == null || landed) return;
    const t = setTimeout(() => setAskedAt(null), REFRESH_GIVE_UP);
    return () => clearTimeout(t);
  }, [askedAt, landed]);
  const refresh = useCallback(async () => {
    if (!token) return;
    setAskedAt(Date.now());
    try {
      await syncNow({ token, force: true, reason: "manual" });
    } catch {
      setAskedAt(null);
    }
  }, [token, syncNow]);
  return { refresh, refreshing: askedAt != null && !landed };
}
