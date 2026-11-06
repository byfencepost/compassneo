import { useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { glowTop, TopGlow } from "@/components/ui/backdrop";
import { dayIn, zoneOf } from "@/lib/days";
import { useSession } from "@/lib/session";
import { useSyncRefresh } from "@/lib/sync";
import { useNow } from "@/lib/time";
import { useDay } from "@/lib/timetable";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { useClassDetail, useClassResources, useClassWork, useLessonPlans, type ClassLesson } from "@/features/class/data";
import { noResources } from "@/features/class/files";
import { FilesTab } from "@/features/class/files-tab";
import { GradesTab } from "@/features/class/grades-tab";
import { ClassHero } from "@/features/class/hero";
import { ClassHue, SkeletonBlock, tick } from "@/features/class/kit";
import { isOver, leadLesson, nextLine } from "@/features/class/lessons";
import { LessonsTab } from "@/features/class/lessons-tab";
import { OverviewTab } from "@/features/class/overview-tab";
import { isTab, TAB_ORDER, TabPage, Tabs, type TabId } from "@/features/class/tabs";
import { WorkTab } from "@/features/class/work-tab";
import { workItems } from "@/features/class/work";

const one = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** How many of the lessons after the one it leads with the overview lists. */
const NEXT_LESSONS = 4;

/** The room between the navigation bar and the class's name: the name starts just under the bar. */
const TOP = space[2];

/** How far below the navigation bar the class's colour has faded into the page: about the foot of the switcher. */
const GLOW = 180;

/**
 * One class, pushed over home: `/class/<code>`, opened on a tab (`tab`) and seen from a day (`day`, the day it
 * was picked on; today when not given). The phone's own version of the web's class panel
 * (apps/web/app/features/class/class-panel.tsx).
 */
export default function ClassRoute() {
  const params = useLocalSearchParams<{ code: string; tab?: string; day?: string }>();
  const session = useSession();
  const code = one(params.code) ?? "";
  const tab = one(params.tab);
  const day = one(params.day);
  // Signed out, the root layout's guard takes the phone to sign-in; nothing to draw meanwhile.
  if (!session.token || !session.me || !code) return null;
  return <ClassScreen token={session.token} slug={session.me.slug} code={code} asked={isTab(tab) ? tab : null} openedOn={day && DAY.test(day) ? day : null} />;
}

/**
 * The class on the flat page, its colour washing down from the top of the screen (TopGlow) behind its name: the name
 * and two dense lines about it, the switcher of its sections, and the open section's cards, all in one scroll. On iOS
 * the navigation bar is see-through, so the scroll (and the glow at its top) runs under it and its glass back button
 * floats over the colour; the content itself starts just under the bar.
 *
 * Its colour and name come first from the day the phone already keeps (lib/timetable.ts), so the screen opens in the
 * right colour; the class's detail (convex/classes.ts) fills the rest when it lands. Tabs appear only when the class
 * has something for them, as on the web, and hold their place while the one asked for is still loading. Pull to
 * refresh asks the sync for a run and fetches the class's work (and, on Files, its resources) again.
 */
function ClassScreen({ token, slug, code, asked, openedOn }: { token: string; slug: string; code: string; asked: TabId | null; openedOn: string | null }) {
  const c = useTheme();
  const inset = useSafeAreaInsets();
  const zone = zoneOf(slug);
  const now = useNow();
  const today = dayIn(zone, now);
  const day = openedOn ?? today;

  const detail = useClassDetail(token, code, day);
  const work = useClassWork(token, code);
  const [tab, setTab] = useState<TabId>(asked ?? "overview");
  const resources = useClassResources(token, code, tab === "files");
  const seen = useDay(token, day).day?.lessons.find(l => l.code === code) ?? null;
  const sync = useSyncRefresh(token);
  const [pulling, setPulling] = useState(false);
  const [titled, setTitled] = useState(false);

  const scroll = useRef<ScrollViewInstance>(null);
  const y = useRef(0);
  const nameFoot = useRef(0);
  const tabsTop = useRef(0);

  const loading = detail === undefined;
  const hue = detail?.hue ?? seen?.hue ?? null;
  const color = classColor(hue, c);
  const name = detail?.name ?? seen?.name ?? code;
  const subject = detail?.subject ?? seen?.subject ?? null;
  const teachers = detail?.teachers.length ? detail.teachers : seen?.teacher ? [seen.teacher] : [];

  // The lesson the overview leads with, the few after it, and the plans worth fetching: those and the last few. Until
  // the detail lands, the day's own lesson of the class stands in, so the lesson card is there on the first frame.
  const seenLesson: ClassLesson | null = seen && {
    id: seen.id,
    day,
    start: seen.start,
    finish: seen.finish,
    period: seen.period,
    room: seen.room,
    roomWas: seen.roomWas,
    teacher: seen.teacher,
    teacherWas: seen.teacherWas,
  };
  const lessons = detail?.lessons ?? (seenLesson ? [seenLesson] : []);
  const { lesson, next, ahead } = leadLesson(lessons, openedOn, today, now);
  const after = lesson ? ahead.filter(x => Date.parse(x.start) > Date.parse(lesson.start)).slice(0, NEXT_LESSONS) : [];
  const past = lessons.filter(l => isOver(l, now)).slice(-3);
  const plans = useLessonPlans(token, [...(lesson ? [lesson.id] : []), ...ahead.slice(0, 12).map(x => x.id), ...past.map(x => x.id)]);

  const grades = detail?.grades.status === "ready" ? detail.grades : null;
  const main = grades?.current ?? grades?.other ?? null;
  const assessments = [...(grades?.current?.tasks ?? []), ...(grades?.other?.tasks ?? [])];
  const { items } = workItems(work.data);
  const has: Record<TabId, boolean> = {
    overview: true,
    grades: !!main || (loading && asked === "grades"),
    work: items.length > 0 || !!detail?.tasks.length || (asked === "work" && work.data === undefined),
    files: !noResources(resources.data),
    lessons: loading || !!detail?.lessons.length,
  };
  const tabs = TAB_ORDER.filter(id => has[id]);
  const shown = tabs.includes(tab) ? tab : "overview";

  // iOS draws the navigation bar over the scroll (headerTransparent); Android's sits above it.
  const under = Platform.OS === "ios" ? inset.top + 44 : 0;
  // iOS insets the scroll by the bar and the home indicator itself ("automatic"); Android's foot is added here.
  const foot = (Platform.OS === "ios" ? 0 : inset.bottom) + space[12];
  const go = (id: TabId) => {
    if (id === shown) return;
    setTab(id);
    // Switched from far down the page: back up to the tabs, so the new section starts at its top.
    if (y.current + under > tabsTop.current) scroll.current?.scrollTo({ y: tabsTop.current - under - space[2], animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = e.nativeEvent.contentOffset.y;
    // Android's bar is solid: it takes the class's name once the name has scrolled under it. iOS's is see-through glass,
    // so the name stays the hero's.
    if (Platform.OS !== "android") return;
    const gone = y.current + under > TOP + nameFoot.current;
    if (gone !== titled) setTitled(gone);
  };

  const onRefresh = async () => {
    tick();
    setPulling(true);
    void sync.refresh();
    try {
      await Promise.all([work.reload(), shown === "files" ? resources.refresh() : Promise.resolve()]);
    } finally {
      setPulling(false);
    }
  };

  const page = (() => {
    switch (shown) {
      case "overview":
        return <OverviewTab detail={detail} lead={lesson ? { lesson, next } : null} after={after} plans={plans} zone={zone} today={today} now={now} has={has} go={go} />;
      case "grades":
        return grades ? <GradesTab grades={grades} now={now} zone={zone} today={today} /> : <SkeletonBlock rows={[56, 36, 36, 36]} />;
      case "work":
        return <WorkTab work={work.data} code={code} zone={zone} today={today} now={now} assessments={assessments} />;
      case "files":
        return <FilesTab data={resources.data} refreshing={resources.refreshing} token={token} today={today} now={now} />;
      case "lessons":
        return detail ? <LessonsTab detail={detail} plans={plans} zone={zone} today={today} now={now} /> : <SkeletonBlock rows={[36, 36, 36, 36]} />;
    }
  })();

  return (
    <ClassHue hue={hue}>
      <Stack.Screen
        options={{
          headerTitle: Platform.OS === "android" && titled ? name : "",
          headerTintColor: color.accent,
          // Android's bar is solid: it wears the glow's own top colour, so the two meet without an edge.
          ...(Platform.OS === "android" && { headerStyle: { backgroundColor: glowTop(color.fill, c) } }),
        }}
      />
      {/* The scroll is this page's first view all the way down (the View holds nothing else), which is how
          react-native-screens finds it to give it the scroll edge effect, and how iOS finds it to inset. */}
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1, backgroundColor: "transparent" }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingTop: TOP, paddingHorizontal: space[4], paddingBottom: foot, gap: space[3] }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={32}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void onRefresh()} tintColor={c.text2} colors={[c.neo]} progressBackgroundColor={c.paper} />}
        >
          {/* First in the content and out of its flow: it scrolls away with the name. */}
          <TopGlow color={color.fill} behind={under} height={under + GLOW} />
          <ClassHero
            name={name}
            code={code}
            subject={subject}
            teachers={teachers}
            next={nextLine(lessons, zone, today, now)}
            loading={loading}
            onNameLayout={bottom => (nameFoot.current = bottom)}
          />
          {tabs.length > 1 && (
            <View onLayout={e => (tabsTop.current = e.nativeEvent.layout.y)}>
              <Tabs tabs={tabs} value={shown} onChange={go} />
            </View>
          )}
          {/* The section slides in from the side of the tab picked (features/class/tabs.tsx). */}
          <TabPage tab={shown}>{page}</TabPage>
        </ScrollView>
      </View>
    </ClassHue>
  );
}
