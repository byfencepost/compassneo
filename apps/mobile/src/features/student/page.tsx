import type { ReactNode } from "react";
import { Screen } from "@/components/ui/screen";
import { dayIn, zoneOf } from "@/lib/days";
import { useSession } from "@/lib/session";
import { useChecked } from "@/lib/sync";
import { useNow } from "@/lib/time";
import { Updated } from "./parts";

/**
 * What every student page needs to read its data: the session's token, the school's time zone, now (each minute, so
 * "On now" and "Updated 5 minutes ago" keep moving) and the school's today.
 */
export function useStudent() {
  const { me, token } = useSession();
  const zone = zoneOf(me?.slug ?? "");
  const now = useNow(60_000);
  return { token, zone, now, today: dayIn(zone, now) };
}

/**
 * A student page: one scroll under the native header (which carries its title), pull to refresh fetching its data
 * now, and at its foot when that data was last checked (its row's fetch, or a sync step that came back since).
 */
export function StudentFrame({
  token,
  now,
  fetchedAt,
  steps,
  refreshing,
  onRefresh,
  children,
}: {
  token: string | null;
  now: number;
  fetchedAt: number | undefined;
  steps: string[];
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const checked = useChecked(token, fetchedAt, steps);
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {children}
      <Updated at={checked} refreshing={refreshing} now={now} />
    </Screen>
  );
}
