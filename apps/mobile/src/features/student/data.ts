import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { signOutNotice } from "@/lib/notice";

/**
 * The student's own year beyond the timetable, as the web reads it (apps/web/app/lib/neo/student.ts): attendance
 * (convex/attendance.ts), events (convex/events.ts) and Chronicle (convex/chronicle.ts). Each sync fetches all three;
 * a page's pull to refresh fetches its own one now, through its load action.
 */

export type Attendance = NonNullable<FunctionReturnType<typeof api.attendance.get>>;
export type CompassAttendance = NonNullable<Attendance["compass"]>;
export type AttendanceClass = CompassAttendance["classes"][number];
/** Connect's side when it answered (otherwise the connect field is { error } or null). */
export type ConnectAttendance = Extract<NonNullable<Attendance["connect"]>, { days: unknown }>;

export type Events = NonNullable<FunctionReturnType<typeof api.events.get>>;
export type SchoolEvent = Events["events"][number];
export type EventSession = SchoolEvent["sessions"][number];

export type Chronicle = NonNullable<FunctionReturnType<typeof api.chronicle.get>>;
export type ChronicleEntry = Chronicle["entries"][number];

/** The sync's steps that bring each page (server: sync.ts), for when it was last checked (useChecked). */
export const STEPS = {
  attendance: ["compass:attendance", "connect:attendance"],
  events: ["compass:events"],
  chronicle: ["compass:chronicle"],
};

type Load = (args: { token: string }) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;

/**
 * A fetch now, for pull to refresh: refreshing until the action comes back. A failed fetch leaves the last answer on
 * screen; a device the server has signed out hears why on the sign-in screen, as the timetable's fetch does.
 */
function useRefresh(run: Load, token: string | null) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const r = await run({ token });
      if (!r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
    } catch {
      // The query keeps the last answer; a failed refresh changes nothing on screen.
    } finally {
      setRefreshing(false);
    }
  }, [token, run]);
  return { refresh, refreshing };
}

/** undefined while loading, null before the first sync has fetched it. */
export function useAttendance(token: string | null) {
  const data = useQuery(api.attendance.get, token ? { token } : "skip");
  return { data, ...useRefresh(useAction(api.attendance.load), token) };
}

export function useEvents(token: string | null) {
  const data = useQuery(api.events.get, token ? { token } : "skip");
  return { data, ...useRefresh(useAction(api.events.load), token) };
}

export function useChronicle(token: string | null) {
  const data = useQuery(api.chronicle.get, token ? { token } : "skip");
  return { data, ...useRefresh(useAction(api.chronicle.load), token) };
}

/** When attendance was last fetched: Compass's side, else Connect's. */
export const attendanceAt = (a: Attendance | null | undefined) =>
  a?.compass?.fetchedAt ?? (a?.connect && "fetchedAt" in a.connect ? a.connect.fetchedAt : undefined);
