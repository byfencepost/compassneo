import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { whenOf, type Lesson } from "@/lib/timetable";
import { timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { alpha, classColor, space, type ClassColor } from "@/theme/tokens";
import { heroStatus, lessonLabel, timeRange } from "./day";
import { Glyph } from "./glyph";
import { AssemblyNote, Donut, LessonGlyph, RoomTag, tabular, TeacherName } from "./parts";
import { timings } from "./motion";
import { Press } from "./press";

/** The hero's second line (teacher and time), in the web's 15px medium. */
const LINE = { fontSize: 15, lineHeight: 20, fontWeight: "500" } as const;

/**
 * The lesson that matters now, as the first and biggest cell of the day's block (the web's hero ClassCard): what is
 * happening ("Now · 25 min left", "Next · in 10 min", a period on another day), the subject's glyph, the class's name
 * large with its room beside it, the teacher and the time under, and the grade's donut at the side. Only the class on
 * now is washed in its colour, deepest at the top edge, with its room filled and a hairline along the foot filling as
 * the lesson goes. Pressing it opens the class.
 */
export function HeroCell({ lesson, now, isToday, zone, onOpen }: { lesson: Lesson; now: number; isToday: boolean; zone: string; onOpen?: () => void }) {
  const c = useTheme();
  const tint = classColor(lesson.hue, c);
  const live = isToday && whenOf(lesson, now) === "now";
  const status = heroStatus(lesson, now, isToday, zone);
  const pct = lesson.grade?.percent;

  return (
    <Press onPress={onOpen} label={lessonLabel(lesson, zone, status)} hint={onOpen && "Opens the class"}>
      {isToday && <Wash tint={tint} live={live} />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[4], paddingTop: 14, paddingBottom: space[4] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {status && (
            <Text variant="caption" tone="2" style={[tabular, { fontWeight: "500", marginBottom: space[1] }]} numberOfLines={1}>
              {status}
            </Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <LessonGlyph lesson={lesson} color={tint.accent} size={22} />
            <Text variant="title" style={{ fontSize: 24, lineHeight: 29, fontWeight: "600", letterSpacing: -0.35, flexShrink: 1 }} numberOfLines={1}>
              {lesson.name}
            </Text>
            <RoomTag room={lesson.room} moved={!!lesson.roomWas} tint={tint} size="lg" solid={live} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], marginTop: space[2] }}>
            <TeacherName lesson={lesson} face={20} textStyle={LINE} />
            <Text variant="label" tone="3" style={[tabular, LINE, { flexShrink: 0 }]} numberOfLines={1}>
              {timeRange(lesson, zone)}
            </Text>
          </View>
          <Notes lesson={lesson} zone={zone} live={live} />
        </View>
        {pct != null && <Donut percent={pct} color={tint.accent} size={60} thickness={9} value={17} />}
      </View>
      {live && <Progress lesson={lesson} now={now} tint={tint} />}
    </Press>
  );
}

/**
 * What the school's notices and Compass change about the lesson, a line each under the time: an assembly that takes
 * it, new bell times, a relief teacher. In the warning ink, or the text's own on the class on now.
 */
function Notes({ lesson, zone, live }: { lesson: Lesson; zone: string; live: boolean }) {
  const c = useTheme();
  const ink = live ? c.text1 : c.warnText;
  const lines = [
    lesson.assembly && <AssemblyNote key="assembly" lesson={lesson} zone={zone} ink={ink} size={13} />,
    lesson.timesWas && (
      <Note key="times" ink={ink}>
        New times from the school&apos;s notices · Compass had {timeRange(lesson.timesWas, zone)}
      </Note>
    ),
    lesson.teacherWas && (
      <Note key="relief" ink={ink} glyph>
        Relief for {lesson.teacherWas.name}
      </Note>
    ),
  ].filter(Boolean);
  if (!lines.length) return null;
  return <View style={{ marginTop: space[2], gap: space[1] }}>{lines}</View>;
}

function Note({ ink, glyph, children }: { ink: string; glyph?: boolean; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
      {glyph && <Glyph name="relief" size={12} color={ink} weight="bold" />}
      <Text variant="caption" color={ink} style={{ fontWeight: "500", flexShrink: 1 }} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

/**
 * The class on now's wash: its colour over the cell, deepest at the top edge. It comes in on the state ease when its
 * class begins (and goes the same way), rather than switching on; a cell that arrives already on now has it at once.
 * Behind the cell's content, over its paper.
 */
function Wash({ tint, live }: { tint: ClassColor; live: boolean }) {
  const c = useTheme();
  const still = useReducedMotion();
  const shown = useSharedValue(live ? 1 : 0);
  useEffect(() => {
    shown.set(still ? (live ? 1 : 0) : withTiming(live ? 1 : 0, timing.state));
  }, [live, still, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const fill: ViewStyle = { backgroundImage: `linear-gradient(to bottom, ${alpha(tint.fill, c.dark ? 0.55 : 0.5)}, ${alpha(tint.fill, c.dark ? 0.22 : 0.2)})` };
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fill, style]} />;
}

/**
 * How much of the lesson on now has gone: a hairline along the cell's foot in the class's colour, scaled out from the
 * start as the web's is. It draws in when it arrives, on the same long settle as the grade's arc beside it, then eases
 * on as the clock moves. Still, for reduced motion.
 */
function Progress({ lesson, now, tint }: { lesson: Lesson; now: number; tint: ClassColor }) {
  const c = useTheme();
  const still = useReducedMotion();
  const start = Date.parse(lesson.start);
  const done = Math.max(0.02, Math.min(1, (now - start) / (Date.parse(lesson.finish) - start)));
  const grown = useSharedValue(still ? done : 0);
  useEffect(() => {
    grown.set(still ? done : withTiming(done, timings.draw));
  }, [done, still, grown]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: grown.get() }] }));
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: c.lineFaint }}>
      <Animated.View style={[{ height: 2, backgroundColor: tint.accent, transformOrigin: "left center" }, style]} />
    </View>
  );
}
