import { useState } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/ui/screen";
import { addDays, dayIn, daysApart, zoneOf } from "@/lib/days";
import { useSession, type Me } from "@/lib/session";
import { useGuest } from "@/lib/guest";
import { useSyncRefresh, useSyncState } from "@/lib/sync";
import { useDay, type Lesson } from "@/lib/timetable";
import { useNow } from "@/lib/time";
import { space } from "@/theme/tokens";
import { daySummary } from "@/features/today/day";
import { DayPicker } from "@/features/today/day-picker";
import { DayView } from "@/features/today/day-view";
import { useTopBar } from "@/features/home/top-bar";
import { ClassList } from "@/features/home/class-list";
import { GradesRow } from "@/features/grades/grades-row";
import { TodoPreview } from "@/features/todo/todo-preview";
import { NoticesRow } from "@/features/notices/notices-row";
import { StudentShortcuts } from "@/features/student/shortcuts";
import { GuestHome } from "@/features/guest/guest-home";
import { UpdateCard } from "@/features/home/update-card";

/** Home: the whole app on one page, as on the web. With a guest on (lib/guest.ts), their day instead. */
export default function HomeRoute() {
  const { me, token } = useSession();
  const guest = useGuest();
  // The root layout's guard keeps home to a signed-in device; this is only ever the moment of signing out.
  if (!me || !token) return null;
  if (guest) return <GuestHome guest={guest} />;
  return <Home me={me} token={token} />;
}

/**
 * Where the app opens, in the web home's order (apps/web/app/routes/home.tsx): the top bar (the mark, the sync gauge,
 * the photo that opens settings, all in the native navigation bar: features/home/top-bar.tsx), the day's classes, the
 * day picker under them, grades, what's to do, the classes, notices, then attendance, events and Chronicle. Each of
 * those is a row or a minimized section that opens its own page. Today follows the clock; a day picked stays picked.
 * Pulling down syncs the timetable now. A newer app than this one, when there is one, says so at the top.
 */
function Home({ me, token }: { me: Me; token: string }) {
  const zone = zoneOf(me.slug);
  const now = useNow(15_000);
  const today = dayIn(zone, now);
  const [picked, setPicked] = useState<string | null>(null);
  // Which way the last turn went, and to which day: a day that changes under you (midnight) fades in instead.
  const [turn, setTurn] = useState<{ to: string; dir: -1 | 1 } | null>(null);
  const day = picked ?? today;
  const dir = turn?.to === day ? turn.dir : 0;

  const shown = useDay(token, day);
  useDay(token, addDays(day, -1));
  useDay(token, addDays(day, 1));

  // A pull is done once the timetable step has come back since it was asked, not when the whole sync has.
  const timetableChecked = useSyncState(token)?.checked["compass:timetable"];
  const pull = useSyncRefresh(token, timetableChecked, ["compass:timetable"]);

  const goTo = (next: string) => {
    if (next === day) return;
    setTurn({ to: next, dir: daysApart(day, next) > 0 ? 1 : -1 });
    setPicked(next === today ? null : next);
  };
  const move = (by: -1 | 1) => goTo(addDays(day, by));
  // The picker's buttons tick on their own; a swipe has no button, so it ticks here.
  const swiped = (by: -1 | 1) => {
    void Haptics.selectionAsync().catch(() => {});
    move(by);
  };
  const open = (l: Lesson) => router.push({ pathname: "/class/[code]", params: { code: l.code, day } });
  const bar = useTopBar({ me, token, onToday: () => goTo(today) });

  return (
    <>
      <Stack.Screen options={bar} />
      <Screen refreshing={pull.refreshing} onRefresh={() => void pull.refresh()} contentStyle={{ gap: space[5] }}>
        <UpdateCard />
        <View style={{ gap: space[3] }}>
          <DayView dayKey={day} today={today} shown={shown} now={now} zone={zone} dir={dir} onOpen={open} onMove={swiped} onGoTo={goTo} />
          <DayPicker day={day} today={today} summary={shown.day ? daySummary(shown.day, zone) : null} onMove={move} onToday={() => goTo(today)} />
        </View>
        <GradesRow token={token} day={day} />
        <TodoPreview token={token} today={today} zone={zone} now={now} />
        <ClassList token={token} day={day} today={today} zone={zone} now={now} />
        <NoticesRow token={token} today={today} zone={zone} now={now} />
        <StudentShortcuts token={token} today={today} zone={zone} now={now} />
      </Screen>
    </>
  );
}
