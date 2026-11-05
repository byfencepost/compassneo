import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";

/**
 * The student's own year, beyond the timetable: attendance (convex/attendance.ts), events (convex/events.ts) and
 * Chronicle (convex/chronicle.ts). Each sync fetches all three; refresh fetches one now.
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

function useRefresh(run: (args: { token: string }) => Promise<unknown>, token: string | null) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await run({ token });
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
