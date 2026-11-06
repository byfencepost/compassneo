import { useEffect, useId, useState } from "react";
import { View, type TextStyle } from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { SubjectGlyph } from "@/features/grades/subject-glyph";
import { Text } from "@/components/ui/text";
import type { Lesson } from "@/lib/timetable";
import { useTheme } from "@/theme/theme";
import { space, type ClassColor, type Palette } from "@/theme/tokens";
import { assemblyText, initials } from "./day";
import { Glyph } from "./glyph";
import { timings } from "./motion";

/**
 * The small pieces a lesson's cell is drawn from, each the web's own (apps/web/app/features/timetable/class-card.tsx,
 * donut.tsx, timetable.css): the subject's glyph, the room tag, the teacher's face and name, the assembly's mark and
 * the grade donut. A class carries its colour only in these accents; the cell itself stays paper.
 */

export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

/**
 * The colours of a class already over today: its colour gone, as the web greys a finished card out, so it reads as
 * done at a glance and never competes with what is still to come.
 */
export const spent = (c: Palette): ClassColor => ({ fill: c.text3, on: c.paper, accent: c.text2, tint: "transparent", line: c.lineControl });

/** The kind of subject, as a glyph in the class's colour before its name. */
export function LessonGlyph({ lesson, color, size }: { lesson: Lesson; color: string; size: number }) {
  return <SubjectGlyph names={[lesson.subject, lesson.name, lesson.code]} color={color} size={size} />;
}

/** The web's room tag sizes (timetable.css .neo-room): type, padding and corner, so the tag sits concentric in its row. */
const ROOM = {
  lg: { fontSize: 17, lineHeight: 20, px: 8, py: 3, round: 8, glyph: 12 },
  md: { fontSize: 12, lineHeight: 14, px: 5, py: 2, round: 6, glyph: 10 },
  sm: { fontSize: 11, lineHeight: 13, px: 5, py: 2, round: 5, glyph: 9 },
} as const;

/**
 * A room (or an assembly's place) as the web tags it: outlined in the class's colour, its ink in the colour too; the
 * class on now has it filled, its own ink on the fill. A room that changed today carries the swap glyph inside the tag.
 */
export function RoomTag({ room, moved, tint, size, solid }: { room: string | null; moved?: boolean; tint: ClassColor; size: keyof typeof ROOM; solid?: boolean }) {
  if (!room) return null;
  const s = ROOM[size];
  const ink = solid ? tint.on : tint.accent;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        flexShrink: 0,
        borderRadius: s.round,
        borderCurve: "continuous",
        paddingHorizontal: s.px,
        paddingVertical: s.py,
        borderWidth: 1.5,
        borderColor: solid ? tint.fill : tint.accent,
        backgroundColor: solid ? tint.fill : "transparent",
      }}
    >
      {moved && <Glyph name="moved" size={s.glyph} color={ink} weight="bold" />}
      <Text variant="label" color={ink} style={[tabular, { fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: "600" }]} numberOfLines={1}>
        {room}
      </Text>
    </View>
  );
}

/**
 * A teacher's Compass photo once a sync has copied it, else their initials on the grey field. The initials stay under
 * the photo, so a face sits the same with or without one; a photo that fails to load leaves them.
 */
export function Face({ person, size = 20 }: { person: NonNullable<Lesson["teacher"]>; size?: number }) {
  const c = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const photo = person.photoUrl && failed !== person.photoUrl ? person.photoUrl : null;
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.field, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
    >
      <Text variant="caption" style={{ fontSize: size * 0.42, lineHeight: size * 0.5, fontWeight: "600", opacity: photo ? 0 : 1 }}>
        {initials(person)}
      </Text>
      {photo && (
        <Image
          source={{ uri: photo }}
          style={{ position: "absolute", top: 0, left: 0, width: size, height: size }}
          contentFit="cover"
          transition={120}
          onError={() => setFailed(photo)}
        />
      )}
    </View>
  );
}

/**
 * Who takes the class: their face and name, and the swap glyph after it when it is a relief. `faceOnly`: the face alone
 * stands for the teacher (a row, where the phone has no room for the name; the cell says it for screen readers).
 */
export function TeacherName({ lesson, face, faceOnly, textStyle }: { lesson: Lesson; face?: number; faceOnly?: boolean; textStyle?: TextStyle }) {
  const c = useTheme();
  if (!lesson.teacher) return null;
  return (
    // Only the name gives way when a line runs short: a face on its own keeps its size.
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], flexShrink: faceOnly ? 0 : 1, minWidth: 0 }}>
      {face != null && <Face person={lesson.teacher} size={face} />}
      {!faceOnly && (
        <Text variant="caption" tone="1" style={[{ flexShrink: 1 }, textStyle]} numberOfLines={1}>
          {lesson.teacher.name}
        </Text>
      )}
      {lesson.teacherWas && <Glyph name="relief" size={11} color={c.warnText} weight="bold" />}
    </View>
  );
}

/**
 * The mark an assembly leaves on a lesson ("Assembly instead", "Assembly 9:00 – 9:40, then class") in the warning ink,
 * as the web has it; `ink` overrides it (the text's own on the class on now, washed in its colour; grey on a finished
 * line). `glyphOnly`: the glyph alone stands for it (a row, a finished line, where there is no room for the words).
 */
export function AssemblyNote({ lesson, zone, ink, glyphOnly, size = 12 }: { lesson: Lesson; zone: string; ink?: string; glyphOnly?: boolean; size?: number }) {
  const c = useTheme();
  const text = assemblyText(lesson, zone);
  if (!text) return null;
  const color = ink ?? c.warnText;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], flexShrink: glyphOnly ? 0 : 1, minWidth: 0 }}>
      <Glyph name="assembly" size={size} color={color} />
      {!glyphOnly && (
        <Text variant="caption" color={color} style={{ fontSize: size, lineHeight: size + 4, fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>
          {text}
        </Text>
      )}
    </View>
  );
}

const R = 42;
const ROUND = 2 * Math.PI * R;

/** A #rrggbb colour moved toward another by t (0 to 1), for the donut's lit edge. */
function mix(hex: string, to: string, t: number) {
  const a = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const b = parseInt(to.replace("#", "").slice(0, 6), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

const Arc = Animated.createAnimatedComponent(Circle);

/**
 * A grade as the web's donut draws it: the arc is the mark out of 100 in the class's colour, lit from above (lighter
 * at the top), round from twelve o'clock, on a track that looks pressed in. The stroke is in the ring's own units, so
 * a small ring carries a thicker one. `value` is the number's size in the middle; none for a ring too small to hold it.
 *
 * The arc draws itself in from twelve o'clock when the donut arrives, on the long settle (as the web's and the grades'
 * Ring do), and moves there again when the mark does; a re-render alone leaves it be. Still, for reduced motion.
 */
export function Donut({ percent, color, size, thickness, value }: { percent: number; color: string; size: number; thickness: number; value?: number }) {
  const c = useTheme();
  const still = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const p = Math.max(0, Math.min(100, percent));
  const shown = Math.round(p);
  const ink = c.dark ? "#F4F4F3" : "#050505";
  const lit = color.startsWith("#") ? mix(color, "#ffffff", 0.25) : color;
  const drawn = useSharedValue(still ? p : 0);
  useEffect(() => {
    drawn.set(still ? p : withTiming(p, timings.draw));
  }, [p, still, drawn]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: ROUND * (1 - drawn.get() / 100) }));
  return (
    <View accessible={false} style={{ width: size, height: size, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lit} />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
          <LinearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink} stopOpacity={c.dark ? 0.07 : 0.16} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.1} />
          </LinearGradient>
        </Defs>
        <Circle cx={50} cy={50} r={R} fill="none" strokeWidth={thickness} stroke={`url(#${id}t)`} />
        {p > 0 && (
          <Arc
            cx={50}
            cy={50}
            r={R}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            stroke={`url(#${id}a)`}
            strokeDasharray={`${ROUND} ${ROUND}`}
            transform="rotate(-90 50 50)"
            animatedProps={arc}
          />
        )}
      </Svg>
      {value != null && (
        <Text variant="label" style={[tabular, { fontSize: value, lineHeight: value + 2, fontWeight: "600" }]}>
          {shown}
        </Text>
      )}
    </View>
  );
}
