import { useState } from "react";
import { View } from "react-native";
import { Card, Rule } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { dayName } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Meter, Pill, PlanText, TeacherFace } from "./bits";
import type { ClassLesson, LessonPlan } from "./data";
import { Glyph } from "./glyph";
import { Block, FIGURE, FootChip, OpenRow, useHue } from "./kit";
import { isOn, isOver, rangeOf, whenLine } from "./lessons";

/**
 * Lessons as the class screen shows them: the one it leads with as a card of its own, the rest as rows that open to
 * their plan, and a plan as its teacher wrote it. After the web's sections.tsx.
 */

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** The one lesson that matters: on now (with how far through it is), next, or the one on the day it was opened from. */
export function LessonCard({ lesson, next, zone, today, now }: { lesson: ClassLesson; next: boolean; zone: string; today: string; now: number }) {
  const c = useTheme();
  const hue = useHue();
  const on = isOn(lesson, now);
  const over = isOver(lesson, now);
  const start = Date.parse(lesson.start);
  const finish = Date.parse(lesson.finish);
  return (
    <Card panelStyle={{ gap: space[1.5], paddingVertical: space[3] + 2 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[3] }}>
        <Text variant="label" color={on ? hue.accent : c.text2} style={{ flex: 1, fontWeight: on ? "600" : "500" }} numberOfLines={1}>
          {whenLine(lesson, next, today, now)}
        </Text>
        {lesson.period != null && (
          <Text variant="label" tone="3" style={TABULAR}>
            Period {lesson.period}
          </Text>
        )}
      </View>
      <Text variant="heading" tone={over ? "2" : "1"} style={FIGURE}>
        {rangeOf(lesson, zone)}
      </Text>
      {on && <Meter value={(now - start) / (finish - start)} color={hue.fill} />}
      {(lesson.room || lesson.teacher) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], marginTop: space[1] }}>
          {lesson.room && <Pill label={lesson.room} glyph={lesson.roomWas ? "roomMoved" : "room"} tone={lesson.roomWas ? "warn" : "neutral"} />}
          {lesson.teacher && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], flex: 1 }}>
              <TeacherFace person={lesson.teacher} size={22} />
              <Text variant="caption" tone="2" numberOfLines={1} style={{ flex: 1 }}>
                {lesson.teacher.full ?? lesson.teacher.name}
              </Text>
            </View>
          )}
        </View>
      )}
      {lesson.roomWas && (
        <Text variant="caption" tone="warn">
          Room moved from {lesson.roomWas} to {lesson.room}
        </Text>
      )}
      {lesson.teacherWas && lesson.teacher && (
        <Text variant="caption" tone="warn">
          {lesson.teacher.full ?? lesson.teacher.name} is covering for {lesson.teacherWas.name}
        </Text>
      )}
    </Card>
  );
}

const PLAN_PREVIEW = 5;

/** The plan of the lesson the overview leads with. A long plan shows its start, with a way to read the rest. */
export function PlanCard({ plan }: { plan: LessonPlan }) {
  const [all, setAll] = useState(false);
  const long = plan.blocks.length > PLAN_PREVIEW + 1;
  return (
    <Block glyph="plan" title="Lesson plan">
      <View style={{ padding: space[4] }}>
        <PlanText blocks={long && !all ? plan.blocks.slice(0, PLAN_PREVIEW) : plan.blocks} />
      </View>
      {long && (
        <>
          <Rule />
          <FootChip label={all ? "Show less" : "Show the whole plan"} onPress={() => setAll(a => !a)} />
        </>
      )}
    </Block>
  );
}

/**
 * A lesson as a row: the day, the time, a plan's and a relief's marks, and the room. One with a plan opens to it.
 * Past ones are dimmed; the one on now carries the class's colour.
 */
export function LessonRow({ lesson: l, zone, today, now, plan, dayLabel }: { lesson: ClassLesson; zone: string; today: string; now: number; plan?: LessonPlan | null; dayLabel?: string }) {
  const c = useTheme();
  const hue = useHue();
  const on = isOn(l, now);
  const past = isOver(l, now);
  const day = dayLabel ?? dayName(l.day, today);
  const head = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
      {on && <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: hue.fill, marginLeft: -space[2] }} />}
      <Text variant="label" color={on ? hue.accent : undefined} tone={past ? "2" : "1"} numberOfLines={1} style={{ width: 96, fontWeight: on ? "600" : "500" }}>
        {on ? "On now" : day}
      </Text>
      <Text variant="bodySm" tone="2" numberOfLines={1} style={[{ flex: 1 }, TABULAR]}>
        {rangeOf(l, zone)}
        {l.period != null ? `  P${l.period}` : ""}
      </Text>
      {plan && <Glyph name="plan" size={14} color={hue.accent} />}
      {l.teacherWas && <Glyph name="relief" size={14} color={c.warnText} />}
      {l.room && <Pill label={l.room} glyph={l.roomWas ? "roomMoved" : undefined} tone={l.roomWas ? "warn" : "neutral"} />}
    </View>
  );
  const label = [
    on ? "On now" : day,
    rangeOf(l, zone),
    l.period != null ? `period ${l.period}` : null,
    l.room ? `room ${l.room}${l.roomWas ? `, moved from ${l.roomWas}` : ""}` : null,
    l.teacherWas && l.teacher ? `${l.teacher.full ?? l.teacher.name} covering` : null,
    plan ? "has a lesson plan" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return <OpenRow head={head} body={plan ? <PlanText blocks={plan.blocks} /> : null} label={label} dim={past && !on} />;
}
