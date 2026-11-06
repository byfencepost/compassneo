import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Text } from "@/components/ui/text";
import { dur, ease, focusIn, staggerDelay, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { alpha, radius, space, type Palette } from "@/theme/tokens";
import { Meter, Pill } from "./bits";
import type { Assessment, ClassGrades, SemesterGrade, Spread } from "./data";
import { Glyph } from "./glyph";
import { pct, rankOf, toneFill, toneText, type Rank, type RankTone } from "./grades";
import { Block, Divided, FIGURE, ROW } from "./kit";

/**
 * The grade as the class screen shows it in more than one place (the overview's block and the Grades tab): a ring, the
 * figure and how much is marked, where it sits in the class, and the assessments as rows with their marks as bars.
 * After the web's sections.tsx.
 */

const TABULAR = { fontVariant: ["tabular-nums" as const] };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A long arrival: fast, then a slow settle, nothing past where it lands (a ring drawing round, a chart drawing across). */
export const DRAW = { duration: dur.open, easing: ease.settle };

/**
 * A grade as a ring, the arc drawn round from twelve o'clock in the grade's colour as it appears, and swept on to a new
 * grade when it changes (another semester, a new mark). With Reduce Motion it is simply there.
 */
export function Ring({ percent, letter, size = 46, stroke = 5 }: { percent: number; letter: string | null; size?: number; stroke?: number }) {
  const c = useTheme();
  const still = useReducedMotion();
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const drawn = useSharedValue(still ? p / 100 : 0);
  useEffect(() => {
    drawn.set(still ? p / 100 : withTiming(p / 100, DRAW));
  }, [p, drawn, still]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.get()) }));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${pct(percent)}%${letter ? `, grade ${letter}` : ""}`} style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.line} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={toneFill(percent, c)}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length} ${length}`}
          animatedProps={arc}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Text variant="label" style={{ fontWeight: "700", fontSize: letter && letter.length > 2 ? 12 : 15 }} numberOfLines={1}>
          {letter ?? Math.round(percent)}
        </Text>
      </View>
    </View>
  );
}

/** Up or down against the other semester, as a small coloured figure. */
function Trend({ from, to, against }: { from: number; to: number; against: number }) {
  const c = useTheme();
  const d = Math.round((to - from) * 10) / 10;
  if (d === 0)
    return (
      <Text variant="caption" tone="2">
        Same as Sem {against}
      </Text>
    );
  const up = d > 0;
  const color = up ? c.okText : c.warnText;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessible accessibilityLabel={`${pct(Math.abs(d))} points ${up ? "up" : "down"} on semester ${against}`}>
      <Glyph name={up ? "up" : "down"} size={12} color={color} />
      <Text variant="caption" color={color} style={[{ fontWeight: "600" }, TABULAR]}>
        {pct(Math.abs(d))} from Sem {against}
      </Text>
    </View>
  );
}

/**
 * The grade in one line: its ring, the figure and letter, how much is marked, and the move on the other semester. Moved
 * to the other semester, the ring sweeps round to its grade and the figures come into focus in place (content only: the
 * switch beside it is glass).
 */
export function GradeSummary({ g, vs }: { g: SemesterGrade; vs: SemesterGrade | null }) {
  return (
    <Divided>
      <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3] + 2, paddingVertical: space[3] + 2 }]}>
        {g.percent != null ? (
          <Ring percent={g.percent} letter={g.letter} />
        ) : (
          <View style={{ width: 46, height: 46, alignItems: "center", justifyContent: "center" }}>
            <Text variant="heading" tone="3">
              –
            </Text>
          </View>
        )}
        <Animated.View key={g.semester} entering={focusIn()} style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2] }}>
            <Text variant={g.percent != null ? "heading" : "subheading"} style={g.percent != null ? FIGURE : TABULAR}>
              {g.percent != null ? `${pct(g.percent)}%` : "No marks yet"}
            </Text>
            {g.letter && (
              <Text variant="label" tone="2">
                {g.letter}
              </Text>
            )}
          </View>
          <Text variant="caption" tone="2" style={TABULAR}>
            {g.marked} of {g.total} marked
          </Text>
          {vs?.percent != null && g.percent != null && <Trend from={vs.percent} to={g.percent} against={vs.semester} />}
        </Animated.View>
      </View>
      {g.percent != null && g.spread && <ClassRank mark={g.percent} spread={g.spread} />}
    </Divided>
  );
}

const rankColor = (tone: RankTone, c: Palette) => ({ ok: c.ok, neo: c.neo, neutral: c.text3, warn: c.warn })[tone];

/**
 * The class as four equal quarters, lowest to highest: the quarters up to the student's tinted in the rank's colour,
 * theirs solid, and a dot at their percentile. The dot travels out from the lowest end to its place as it appears, a
 * step after the ring, and on to a new place when the grade moves; with Reduce Motion it is simply there.
 */
export function RankTrack({ rank: r, height = 8 }: { rank: Rank; height?: number }) {
  const c = useTheme();
  const still = useReducedMotion();
  const color = rankColor(r.tone, c);
  const spot = Math.max(2, Math.min(98, r.percentile));
  const at = useSharedValue(still ? spot : 2);
  useEffect(() => {
    at.set(still ? spot : withDelay(staggerDelay(2), withTiming(spot, timing.settle)));
  }, [spot, at, still]);
  const dot = useAnimatedStyle(() => ({ left: `${at.get()}%` }));
  // The quarters below the student's, tinted: the neutral tone's ink is already translucent, so it takes a line instead.
  const below = r.tone === "neutral" ? c.lineControl : alpha(color, 0.35);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${r.phrase}: ahead of about ${r.percentile}% of the class.`} style={{ height: height + 6, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {[0, 1, 2, 3].map(q => (
          <View
            key={q}
            style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: q === r.quarter ? color : q < r.quarter ? below : c.line }}
          />
        ))}
      </View>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: height + 6,
            height: height + 6,
            marginLeft: -(height + 6) / 2,
            borderRadius: (height + 6) / 2,
            backgroundColor: c.paper,
            borderWidth: 3,
            borderColor: color,
          },
          dot,
        ]}
      />
    </View>
  );
}

/** Where the grade sits in the class, as Connect's chart has it: which quarter, and about how many it is ahead of. */
export function ClassRank({ mark, spread }: { mark: number; spread: Spread }) {
  const c = useTheme();
  const r = rankOf(mark, spread);
  return (
    <View style={[ROW, { gap: space[3], paddingTop: space[3] + 2, paddingBottom: space[4] }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.lineFaint }}>
          <Glyph name="grade" size={18} color={rankColor(r.tone, c)} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{r.phrase}</Text>
          <Text variant="caption" tone="3" style={TABULAR}>
            {r.percentile >= 100 ? "Ahead of everyone" : `Ahead of about ${r.percentile}%`} · median {pct(spread.median)}% · top {pct(spread.max)}%
          </Text>
        </View>
      </View>
      <View style={{ gap: space[1] }}>
        <RankTrack rank={r} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="3">
            Lowest
          </Text>
          <Text variant="caption" tone="3">
            Highest
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A mark's place in its class as a small pill: "Top 25%", "Top half". */
export function RankPill({ mark, spread }: { mark: number; spread: Spread }) {
  const r = rankOf(mark, spread);
  return <Pill label={r.label} tone={r.tone} />;
}

const WEEK = 7 * 86400000;

/**
 * An assessment as a row: its name (with "New" for a mark in the last week), the mark and its share of the grade, the
 * score in its colour and as a bar, and its place in the class. Compass's description only repeats the name, so it
 * does not open. Landing after its section (its grades coming in, another semester picked), the rows come into focus
 * down the list, `index` their place, and their bars grow in the same steps.
 */
export function AssessmentRow({ t, now, index = 0 }: { t: Assessment; now: number; index?: number }) {
  const c = useTheme();
  const marked = t.mark != null;
  const fresh = t.markedAt != null && now - t.markedAt < WEEK;
  const detail = [t.max != null && marked ? `${t.mark}/${t.max}` : null, t.share != null ? `${pct(t.share)}% of grade` : null, t.was != null ? `was ${t.was}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Animated.View entering={focusIn(index)}>
      <View style={[ROW, { gap: space[2] }, !marked && { opacity: 0.6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <Text variant="label" tone={marked ? "1" : "2"} numberOfLines={2} style={{ flexShrink: 1 }}>
                {t.name}
              </Text>
              {fresh && <Pill label="New" tone="neo" />}
            </View>
            {detail.length > 0 && (
              <Text variant="caption" tone="3" style={TABULAR}>
                {detail}
              </Text>
            )}
          </View>
          {marked && t.percent != null ? (
            <Text variant="subheading" color={toneText(t.percent, c)} style={TABULAR}>
              {pct(t.percent)}%
            </Text>
          ) : (
            <Text variant="caption" tone="3">
              {marked ? String(t.mark) : "Not marked"}
            </Text>
          )}
        </View>
        {marked && t.percent != null && <Meter value={t.percent / 100} color={toneFill(t.percent, c)} height={5} delay={staggerDelay(index)} />}
        {marked && t.percent != null && t.spread && <RankPill mark={t.percent} spread={t.spread} />}
      </View>
    </Animated.View>
  );
}

/** Why there is no grade to show yet, or nothing when there is one (or there are no grades at all). */
export function GradeWaiting({ grades }: { grades: ClassGrades }) {
  const c = useTheme();
  if (grades.status !== "loading" && grades.status !== "unavailable") return null;
  return (
    <Block glyph="grade" title="Grade" padded>
      {grades.status === "loading" ? (
        <View accessibilityRole="progressbar" style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <ActivityIndicator size="small" color={c.neoText} />
          <Text variant="bodySm" tone="2">
            Getting your grades
          </Text>
        </View>
      ) : (
        <Text variant="bodySm" tone="2">
          {grades.reason}
        </Text>
      )}
    </Block>
  );
}
