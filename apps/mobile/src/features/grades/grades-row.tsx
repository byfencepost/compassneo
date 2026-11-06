import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import { focusIn, staggerDelay } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { Swap } from "./moving";
import { Ring } from "./ring";
import { mainSubject, SubjectGlyph } from "./subject-glyph";
import { pct, sourceName, tabular, useGrades, type OverviewGrades, type OverviewSubject } from "./data";

/** A ring's size on home: the web's 48px less a little, so five fit side by side on the narrowest phone. */
const RING = 44;
/** A ring's column at its widest, as the web caps it (max-w-16), so four rings don't drift apart. */
const COLUMN = 64;

/**
 * Grades on home, above the to-do list, as the web's grades row has it (apps/web/app/features/home/grades-row.tsx):
 * one card, always there and never folded, of the main subjects' grades (Maths, English, Science, HASS, in that order),
 * each its own ring in its class's colour with its glyph inside and its figure under it, and a last dashed ring saying
 * how many more there are. Every subject is on the Grades page, which pressing the card opens. A school without Connect
 * has no row, unless the student has added Canvas; nor does a student with no subjects yet. It reads the same query the
 * Grades page does (convex/overview.ts `grades`), for the day shown, so the semester is that day's.
 *
 * The rings come into focus a beat apart as they first arrive, each drawing its arc on the same beat. A day turned to is
 * a new question, unanswered for a moment: until it is answered the last answer stays (it is nearly always the same
 * semester), so the rings never blink out and draw in again on every swipe; a figure that does change moves there.
 */
export function GradesRow({ token, day }: { token: string; day: string }) {
  const asked = useGrades(token, day);
  const [held, setHeld] = useState<{ token: string; data: OverviewGrades | null } | null>(null);
  if (asked !== undefined && (held?.token !== token || held.data !== asked)) setHeld({ token, data: asked });
  const data = asked !== undefined ? asked : held?.token === token ? held.data : undefined;
  if (data === null || data?.status === "none") return null;
  if (data?.status === "ready" && !data.subjects.length) return null;
  const ready = data?.status === "ready" ? data : null;
  const shown = (ready?.subjects ?? [])
    .map(s => ({ s, at: mainSubject(s.name, s.subject) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(x => x.s);
  const more = ready ? ready.subjects.length - shown.length : 0;
  const note =
    data?.status === "loading" ? `Getting your grades from ${sourceName(data.source)}` : data?.status === "unavailable" ? data.reason : null;
  const label = ready
    ? ["Grades", ...shown.map(spoken), more > 0 && `And ${more} more ${more === 1 ? "subject" : "subjects"}`].filter(Boolean).join(". ")
    : `Grades. ${note ?? "Loading"}`;

  return (
    <Card
      onPress={() => router.push("/grades")}
      accessibilityLabel={label}
      panelStyle={{ paddingHorizontal: space[2], paddingVertical: space[2] }}
    >
      {ready ? (
        <Rings subjects={shown} more={more} />
      ) : note ? (
        <Text variant="caption" tone="3" style={{ textAlign: "center", paddingHorizontal: space[2], paddingVertical: space[2] }}>
          {note}
        </Text>
      ) : (
        <RingsSkeleton />
      )}
    </Card>
  );
}

const spoken = (s: OverviewSubject) => `${s.name}: ${s.percent != null ? `${pct(s.percent)}%${s.letter ? `, ${s.letter}` : ""}` : "nothing marked yet"}`;

/**
 * The rings in one row, centred, each in an equal share of the width (as the web's GradeRings): a ring in its class's
 * colour, the glyph in the middle and the figure under it in the same colour, so a subject reads the same everywhere.
 * Nothing marked yet is an empty dashed ring and a dash. Only a picture: the card says it all to a screen reader.
 */
function Rings({ subjects, more }: { subjects: OverviewSubject[]; more: number }) {
  const c = useTheme();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", justifyContent: "center", gap: space[1] }}>
      {subjects.map((s, i) => {
        const color = classColor(s.hue, c).accent;
        const figure = s.percent != null ? `${pct(s.percent)}%` : "–";
        return (
          <Column key={s.key} index={i}>
            <Ring percent={s.percent} color={color} size={RING} thickness={9} delay={staggerDelay(i)}>
              <SubjectGlyph names={[s.subject, s.name, s.code]} color={color} size={16} />
            </Ring>
            <Swap id={figure}>
              <Text variant="caption" color={s.percent != null ? color : c.text3} numberOfLines={1} style={[tabular, { fontWeight: "600" }]}>
                {figure}
              </Text>
            </Swap>
          </Column>
        );
      })}
      {more > 0 && (
        <Column index={subjects.length}>
          <Ring percent={null} color={c.text2} size={RING} thickness={9}>
            <Swap id={more}>
              <Text variant="caption" tone="2" style={[tabular, { fontWeight: "600" }]}>
                +{more}
              </Text>
            </Swap>
          </Ring>
          <Text variant="caption" tone="3" style={{ fontWeight: "600" }}>
            more
          </Text>
        </Column>
      )}
    </View>
  );
}

const COLUMN_STYLE = { flex: 1, maxWidth: COLUMN, minWidth: 0, alignItems: "center", gap: space[1], paddingVertical: space[1.5] } as const;

/** One ring's share of the row; given its place in the row, it comes into focus that beat after the first. */
function Column({ children, index }: { children: ReactNode; index?: number }) {
  if (index == null) return <View style={COLUMN_STYLE}>{children}</View>;
  return (
    <Animated.View entering={focusIn(index)} style={COLUMN_STYLE}>
      {children}
    </Animated.View>
  );
}

/** The rings on their way: five the size they will be. */
function RingsSkeleton() {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: space[1] }}>
      {[0, 1, 2, 3, 4].map(i => (
        <Column key={i}>
          <Skeleton height={RING} width={RING} round={RING / 2} />
          <Skeleton height={12} width={32} />
        </Column>
      ))}
    </View>
  );
}
