import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { DayAssembly, Lesson } from "@/lib/timetable";
import { useTheme } from "@/theme/theme";
import { alpha, classColor, space } from "@/theme/tokens";
import { assemblyAbout, assemblyTime, lessonLabel, timeRange } from "./day";
import { Glyph } from "./glyph";
import { AssemblyNote, Donut, LessonGlyph, RoomTag, spent, tabular, TeacherName } from "./parts";
import { Press } from "./press";

/**
 * The day's smaller cells, after the web's ClassCard sizes and AssemblyCard (apps/web/app/features/timetable): a row for
 * each of the two lessons after the hero, tiles two to a row for the rest, a slim greyed line for what is over today,
 * and the school's assemblies as cells of their own. Each lesson opens its class.
 */

/** The meta beside a value (times), in Glaze's 12px caption. */
const META = { fontSize: 12, lineHeight: 16 } as const;

/** onOpen: opens the class; without it (a guest's day) the cell is only read. */
type LessonProps = { lesson: Lesson; zone: string; onOpen?: () => void };

/**
 * One of the two lessons after the hero, on one line: the subject's glyph, the name, the room, the assembly's mark and
 * the teacher's face, then the time and a small donut at the end.
 */
export function RowCell({ lesson, zone, onOpen }: LessonProps) {
  const c = useTheme();
  const tint = classColor(lesson.hue, c);
  const pct = lesson.grade?.percent;
  return (
    <Press onPress={onOpen} label={lessonLabel(lesson, zone)} hint={onOpen && "Opens the class"}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space[4], paddingVertical: 10, minHeight: 52 }}>
        <LessonGlyph lesson={lesson} color={tint.accent} size={16} />
        <Text variant="label" style={{ fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
          {lesson.name}
        </Text>
        <RoomTag room={lesson.room} moved={!!lesson.roomWas} tint={tint} size="md" />
        <AssemblyNote lesson={lesson} zone={zone} glyphOnly />
        <TeacherName lesson={lesson} face={18} faceOnly />
        <Text variant="caption" tone="3" style={[tabular, META, { marginLeft: "auto", flexShrink: 0 }]} numberOfLines={1}>
          {timeRange(lesson, zone)}
        </Text>
        {pct != null && <Donut percent={pct} color={tint.accent} size={30} thickness={12} value={10} />}
      </View>
    </Press>
  );
}

/**
 * A later lesson, half the block's width: the glyph, the name and the room, with the time under (and an assembly's
 * mark, or a relief's teacher, beside it), and a small ring at the corner.
 */
export function TileCell({ lesson, zone, onOpen }: LessonProps) {
  const c = useTheme();
  const tint = classColor(lesson.hue, c);
  const pct = lesson.grade?.percent;
  return (
    <Press onPress={onOpen} label={lessonLabel(lesson, zone)} hint={onOpen && "Opens the class"} outerStyle={{ flex: 1 }} style={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1, flexDirection: "row", alignItems: "flex-start", gap: space[2], paddingHorizontal: space[4], paddingVertical: 10, minHeight: 58 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
            <LessonGlyph lesson={lesson} color={tint.accent} size={14} />
            <Text variant="label" style={{ fontSize: 14, lineHeight: 19, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
              {lesson.name}
            </Text>
            <RoomTag room={lesson.room} moved={!!lesson.roomWas} tint={tint} size="sm" />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Text variant="caption" tone="3" style={[tabular, META, { flexShrink: 0 }]} numberOfLines={1}>
              {timeRange(lesson, zone)}
            </Text>
            {lesson.assembly ? (
              <AssemblyNote lesson={lesson} zone={zone} />
            ) : (
              lesson.teacherWas && <TeacherName lesson={lesson} textStyle={META} />
            )}
          </View>
        </View>
        {pct != null && <Donut percent={pct} color={tint.accent} size={20} thickness={16} />}
      </View>
    </Press>
  );
}

/** A lesson over today: still on the day, one slim line, its colour gone and the whole of it faded back. */
export function DoneCell({ lesson, zone, onOpen }: LessonProps) {
  const c = useTheme();
  const grey = spent(c);
  return (
    <Press onPress={onOpen} label={lessonLabel(lesson, zone, "Over")} hint={onOpen && "Opens the class"}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2], minHeight: 40, opacity: 0.5 }}>
        <LessonGlyph lesson={lesson} color={grey.accent} size={14} />
        <Text variant="caption" style={{ fontSize: 14, lineHeight: 18, fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>
          {lesson.name}
        </Text>
        <RoomTag room={lesson.room} moved={!!lesson.roomWas} tint={grey} size="sm" />
        <AssemblyNote lesson={lesson} zone={zone} ink={c.text2} glyphOnly />
        <Text variant="caption" tone="3" style={[tabular, META, { marginLeft: "auto", flexShrink: 0 }]} numberOfLines={1}>
          {timeRange(lesson, zone)}
        </Text>
      </View>
    </Press>
  );
}

/**
 * An assembly from the school's notices, as a cell at its time among the lessons: its glyph, its name and who it is
 * for, where, and when. Told apart by Neo blue (the glyph, the place's outline, the faintest wash of it), so it reads
 * as the school's rather than a class. Nothing to open: the lessons it takes carry their own mark. `done`: over
 * today, one slim greyed line.
 */
export function AssemblyCell({ assembly: a, zone, done }: { assembly: DayAssembly; zone: string; done: boolean }) {
  const c = useTheme();
  const neo = classColor(null, c);
  const about = assemblyAbout(a);
  const when = assemblyTime(a, zone);
  return (
    <View
      accessible
      accessibilityLabel={[done ? "Over" : null, a.title, when, a.place, about].filter(Boolean).join(", ")}
      style={{ backgroundColor: alpha(c.neo, 0.05) }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: done ? space[2] : 10,
          paddingHorizontal: space[4],
          paddingVertical: done ? space[2] : 10,
          minHeight: done ? 40 : 52,
          opacity: done ? 0.5 : 1,
        }}
      >
        <Glyph name="assembly" size={done ? 14 : 16} color={done ? c.text2 : c.neoText} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="label"
            tone={a.maybe && !done ? "2" : "1"}
            style={done ? { fontSize: 14, lineHeight: 18, fontWeight: "500" } : { fontWeight: "600" }}
            numberOfLines={1}
          >
            {a.title}
          </Text>
          {!done && !!about && (
            <Text variant="caption" tone="3" style={META} numberOfLines={1}>
              {about}
            </Text>
          )}
        </View>
        <RoomTag room={a.place} tint={done ? spent(c) : neo} size={done ? "sm" : "md"} />
        <Text variant="caption" tone="3" style={[tabular, META, { flexShrink: 0 }]} numberOfLines={1}>
          {when}
        </Text>
      </View>
    </View>
  );
}
