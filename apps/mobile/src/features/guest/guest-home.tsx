import { useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/ui/screen";
import { addDays, dayIn, daysApart, zoneOf } from "@/lib/days";
import type { Guest } from "@/lib/guest";
import { useSyncRefresh, useSyncState } from "@/lib/sync";
import { useDay } from "@/lib/timetable";
import { useNow } from "@/lib/time";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { daySummary } from "@/features/today/day";
import { DayPicker } from "@/features/today/day-picker";
import { DayView } from "@/features/today/day-view";
import { GuestBanner } from "./banner";

const NO_BAR = { headerShown: false } as const;

/**
 * Home while a guest is on (lib/guest.ts): their timetable and nothing else, under the banner that signs them out.
 * Their day is home's own (features/today), relief teachers, room changes and assemblies included, turned the same
 * ways (a swipe, the picker, pulling down syncs it now), but its lessons open nothing: the guest's session reads the
 * timetable only (convex/auth.ts), and the phone's own student's pages stay shut behind the root layout's guard.
 *
 * No navigation bar: the banner is the top of the screen, held there while the day scrolls under it.
 */
export function GuestHome({ guest }: { guest: Guest }) {
  const c = useTheme();
  const { token, me } = guest;
  const zone = zoneOf(me.slug);
  const now = useNow(15_000);
  const today = dayIn(zone, now);
  const [picked, setPicked] = useState<string | null>(null);
  const [turn, setTurn] = useState<{ to: string; dir: -1 | 1 } | null>(null);
  const day = picked ?? today;
  const dir = turn?.to === day ? turn.dir : 0;

  // Never kept on the phone: nothing of the guest's stays behind once they sign out.
  const shown = useDay(token, day, { keep: false });
  useDay(token, addDays(day, -1), { keep: false });
  useDay(token, addDays(day, 1), { keep: false });

  const timetableChecked = useSyncState(token)?.checked["compass:timetable"];
  const pull = useSyncRefresh(token, timetableChecked, ["compass:timetable"]);

  const goTo = (next: string) => {
    if (next === day) return;
    setTurn({ to: next, dir: daysApart(day, next) > 0 ? 1 : -1 });
    setPicked(next === today ? null : next);
  };
  const move = (by: -1 | 1) => goTo(addDays(day, by));
  const swiped = (by: -1 | 1) => {
    void Haptics.selectionAsync().catch(() => {});
    move(by);
  };

  return (
    <>
      <Stack.Screen options={NO_BAR} />
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <GuestBanner me={me} />
        <Screen refreshing={pull.refreshing} onRefresh={() => void pull.refresh()}>
          <View style={{ gap: space[3] }}>
            <DayView dayKey={day} today={today} shown={shown} now={now} zone={zone} dir={dir} onMove={swiped} onGoTo={goTo} />
            <DayPicker day={day} today={today} summary={shown.day ? daySummary(shown.day, zone) : null} onMove={move} onToday={() => goTo(today)} />
          </View>
        </Screen>
      </View>
    </>
  );
}
