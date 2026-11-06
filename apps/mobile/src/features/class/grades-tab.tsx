import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { Rule } from "@/components/ui/card";
import { Segmented } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { dayIn, dayName, shortDate } from "@/lib/days";
import { glide, staggerDelay } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { alpha, radius, space } from "@/theme/tokens";
import { Meter } from "./bits";
import type { ReadyGrades, SemesterGrade } from "./data";
import { AssessmentRow, DRAW, GradeSummary, GradeWaiting } from "./grade-parts";
import { changesOf, pct, runningGrade, standing, toneFill, toneText } from "./grades";
import { Block, Divided, ROW, tick, useHue } from "./kit";

/**
 * Every figure about the grade: the summary and the class rank, the grade over time, where it could still finish,
 * semester against semester, every assessment, and the changes as they came in. After the web's pages.tsx and
 * grade-history.tsx; the arithmetic is in grades.ts.
 *
 * Picking the other semester changes only what it shows, in place: the ring sweeps on to its grade, the figures and the
 * assessments come into focus down the page, the chart draws itself again, and where it could finish glides to its new
 * band. The blocks themselves stay where they are.
 */

const TABULAR = { fontVariant: ["tabular-nums" as const] };

export function GradesTab({ grades, now, zone, today }: { grades: ReadyGrades; now: number; zone: string; today: string }) {
  const hue = useHue();
  const [sem, setSem] = useState<number | null>(null);
  const { current, other } = grades;
  const both = current && other ? [current, other].sort((a, b) => a.semester - b.semester) : null;
  const g = (both && sem != null && both.find(s => s.semester === sem)) || current || other;
  if (!g) return <GradeWaiting grades={{ status: "loading" }} />;
  const vs = both?.find(s => s !== g) ?? null;
  const changed = g.points.some(p => !p.baseline) || g.tasks.some(t => t.markedAt != null);
  // Beside the block's label, as wide as its two words and no wider, so "Semester 2" keeps its room.
  const picker = both && (
    <Segmented
      size="sm"
      label="Semester"
      options={both.map(s => ({ value: String(s.semester), label: `Sem ${s.semester}` }))}
      value={String(g.semester)}
      onChange={v => setSem(Number(v))}
      tint={hue.fill}
      on={hue.on}
    />
  );
  return (
    <>
      <Block glyph="grade" title={`Semester ${g.semester}`} aside={picker}>
        <GradeSummary g={g} vs={vs} />
      </Block>
      {runningGrade(g.tasks).length > 0 && (
        <Block glyph="chart" title="Grade over time" padded index={1}>
          <GradeChart key={g.semester} g={g} />
        </Block>
      )}
      <WhereYouFinish g={g} />
      {both && (
        <Block glyph="chart" title="Semester 1 against 2" padded index={3}>
          <Semesters both={both} />
        </Block>
      )}
      <Block glyph="work" title={`Assessments · ${g.marked} of ${g.total} marked`} index={4}>
        <Divided>
          {g.tasks.map((t, i) => (
            <AssessmentRow key={`${g.semester}-${t.id}-${i}`} t={t} now={now} index={i} />
          ))}
        </Divided>
      </Block>
      {changed && (
        <Block glyph="clock" title="Changes" padded index={5}>
          <Changes g={g} since={grades.historySince} zone={zone} today={today} />
        </Block>
      )}
    </>
  );
}

// ---------- the grade over time ----------

const CHART_H = 136;
const AXIS_W = 28;
const PAD_X = 10;
const PAD_Y = 10;

/**
 * The grade as it built up, task by task: the line is the subject's score after each marked task (in the outline's
 * order), the hollow rings each task's own mark. The dashed lines at 50, 65 and 80 are where a grade's colour changes.
 * A finger on the chart picks the task under it (with a tick for each), and the line under the chart reads it out; it
 * starts on the latest. It draws itself in from the left as it appears (as the web's does), on the settling curve; with
 * Reduce Motion it is simply there.
 */
function GradeChart({ g }: { g: SemesterGrade }) {
  const c = useTheme();
  const hue = useHue();
  const still = useReducedMotion();
  const steps = runningGrade(g.tasks);
  const [width, setWidth] = useState(0);
  const [on, setOn] = useState<number | null>(null);
  const reveal = useSharedValue(still ? 1 : 0);
  // It draws once it has a width to draw across, so the draw is seen rather than spent before the first layout.
  const drawn = width > 0;
  useEffect(() => {
    if (drawn && !still) reveal.set(withTiming(1, DRAW));
  }, [drawn, still, reveal]);
  const clip = useAnimatedStyle(() => ({ width: `${reveal.get() * 100}%` }));

  const n = steps.length;
  const plotW = Math.max(0, width - AXIS_W);
  const values = steps.flatMap(s => [s.grade, s.own ?? s.grade]);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 6) / 10) * 10);
  const hi = 100;
  const xAt = (i: number) => (n === 1 ? plotW / 2 : PAD_X + ((plotW - 2 * PAD_X) * i) / (n - 1));
  const yAt = (v: number) => PAD_Y + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (CHART_H - 2 * PAD_Y);
  const line = steps.map((s, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(s.grade).toFixed(1)}`).join(" ");
  const area = `${line} L${xAt(n - 1).toFixed(1)} ${CHART_H} L${xAt(0).toFixed(1)} ${CHART_H} Z`;
  const bands = [50, 65, 80].filter(v => v > lo && v < hi);
  const at = on ?? n - 1;
  const shown = steps[at];
  const ownShown = steps.some(s => s.own != null && Math.abs(s.own - s.grade) > 0.5);

  const pick = (x: number) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
    if (best !== on) {
      tick();
      setOn(best);
    }
  };

  const first = steps[0];
  const last = steps[n - 1];
  const summary =
    !first || !last
      ? ""
      : n === 1
        ? `One task marked so far: ${first.task.name}, ${pct(first.grade)}%.`
        : `Your grade went from ${pct(first.grade)}% after ${first.task.name} to ${pct(last.grade)}% after ${last.task.name}, over ${n} marked tasks.`;

  return (
    <View style={{ gap: space[3] }}>
      <View accessible accessibilityRole="image" accessibilityLabel={summary} onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height: CHART_H }}>
        {width > 0 && (
          <>
            {[...bands, hi].map(v => (
              <Text key={v} variant="caption" tone="3" style={[{ position: "absolute", right: 0, top: yAt(v) - 8, width: AXIS_W - 4, textAlign: "right" }, TABULAR]}>
                {v}
              </Text>
            ))}
            <Animated.View style={[{ position: "absolute", left: 0, top: 0, height: CHART_H, overflow: "hidden" }, clip]}>
              <Svg width={plotW} height={CHART_H}>
                <Defs>
                  <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={hue.fill} stopOpacity={0.32} />
                    <Stop offset="1" stopColor={hue.fill} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                {[...bands, hi].map(v => (
                  <Line key={v} x1={0} x2={plotW} y1={yAt(v)} y2={yAt(v)} stroke={c.line} strokeWidth={1} strokeDasharray="2 4" />
                ))}
                {n > 1 && <Path d={area} fill="url(#area)" />}
                {n > 1 && <Path d={line} fill="none" stroke={hue.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
                {shown && <Line x1={xAt(at)} x2={xAt(at)} y1={0} y2={CHART_H} stroke={c.lineControl} strokeWidth={1} />}
                {steps.map((s, i) =>
                  s.own != null && Math.abs(s.own - s.grade) > 0.5 ? (
                    <Circle key={`own-${s.index}`} cx={xAt(i)} cy={yAt(s.own)} r={3.5} fill="none" stroke={c.text3} strokeWidth={1.5} />
                  ) : null,
                )}
                {steps.map((s, i) => (
                  <Circle key={s.index} cx={xAt(i)} cy={yAt(s.grade)} r={i === at ? 5.5 : 3.5} fill={i === at ? hue.accent : c.paper} stroke={hue.accent} strokeWidth={2} />
                ))}
              </Svg>
            </Animated.View>
            {/* The finger's surface: on top and empty, so where it lands is measured against the chart itself. */}
            <View
              style={{ position: "absolute", left: 0, top: 0, width: plotW, height: CHART_H }}
              onStartShouldSetResponder={() => true}
              onResponderGrant={e => pick(e.nativeEvent.locationX)}
              onResponderMove={e => pick(e.nativeEvent.locationX)}
              onResponderTerminationRequest={() => true}
            />
          </>
        )}
      </View>
      {n <= 16 && width > 0 && (
        <View style={{ height: 16, width: plotW }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {steps.map((s, i) => (
            <Text key={s.index} variant="caption" tone={i === at ? "1" : "3"} style={[{ position: "absolute", left: xAt(i) - 12, width: 24, textAlign: "center" }, TABULAR]}>
              {s.index + 1}
            </Text>
          ))}
        </View>
      )}
      {shown && (
        <View style={{ gap: 2 }} accessibilityLiveRegion="polite">
          <Text variant="label" numberOfLines={1}>
            {shown.index + 1}. {shown.task.name}
          </Text>
          <Text variant="caption" tone="2" style={TABULAR}>
            {shown.task.mark}/{shown.task.max}
            {shown.own != null ? ` · ${pct(shown.own)}%` : ""} · grade <Text variant="caption" color={toneText(shown.grade, c)} style={{ fontWeight: "600" }}>{pct(shown.grade)}%</Text>
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
        <Legend swatch={<View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: hue.accent }} />} label="Your grade after each task" />
        {ownShown && <Legend swatch={<View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: c.text3 }} />} label="That task's own mark" />}
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
      {swatch}
      <Text variant="caption" tone="2">
        {label}
      </Text>
    </View>
  );
}

// ---------- where it could finish ----------

/**
 * Where the semester could end up from here: a band from the lowest possible finish (nothing more earned) to the
 * highest (full marks on everything left), with a mark where keeping up the average so far lands, and under it a few
 * plain "if you get this on the rest, you finish on that" rows.
 */
function WhereYouFinish({ g }: { g: SemesterGrade }) {
  const c = useTheme();
  const hue = useHue();
  const s = standing(g);
  if (!s || s.left <= 0.5) return null;
  const at = (onRest: number) => s.floor + (onRest / 100) * (s.ceiling - s.floor);
  const marked = s.total - s.left;
  const pace = marked > 0 ? (100 * s.earned) / marked : null;
  const rows: { label: string; finish: number }[] = [{ label: "Full marks on the rest", finish: s.ceiling }];
  if (pace != null && pace < 99.5 && pace > 0.5) rows.push({ label: `Keep up your ${pct(pace)}% average`, finish: at(pace) });
  if (pace == null || Math.abs(pace - 50) > 2.5) rows.push({ label: "Half marks on the rest", finish: at(50) });
  rows.push({ label: "Nothing more", finish: s.floor });
  rows.sort((x, y) => y.finish - x.finish);
  const marker = pace != null ? at(pace) : null;
  return (
    <Block glyph="target" title="Where you could finish" index={2}>
      <View
        style={{ padding: space[4], gap: space[2] }}
        accessible
        accessibilityLabel={`At worst ${pct(s.floor)}%, at best ${pct(s.ceiling)}%${marker != null ? `, keeping your average ${pct(marker)}%` : ""}.`}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="3">
            At worst <Text variant="caption" style={TABULAR}>{pct(s.floor)}%</Text>
          </Text>
          <Text variant="caption" tone="3">
            At best <Text variant="caption" style={TABULAR}>{pct(s.ceiling)}%</Text>
          </Text>
        </View>
        <View style={{ height: 18, justifyContent: "center" }}>
          {/* Another semester picked, the band and the mark glide to their new places. */}
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.line, overflow: "hidden" }}>
            <Animated.View
              layout={glide}
              style={{ position: "absolute", left: `${s.floor}%`, width: `${Math.max(1, s.ceiling - s.floor)}%`, top: 0, bottom: 0, borderRadius: 5, backgroundColor: alpha(hue.fill, 0.55) }}
            />
          </View>
          {marker != null && (
            <Animated.View
              layout={glide}
              style={{ position: "absolute", left: `${marker}%`, marginLeft: -2, width: 4, height: 18, borderRadius: radius.pill, backgroundColor: c.text1 }}
            />
          )}
        </View>
      </View>
      <Divided>
        {rows.map(({ label, finish }) => (
          <View key={label} style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3] }]} accessible accessibilityLabel={`${label}: ${pct(finish)}%`}>
            <Text variant="label" tone="2" style={{ flex: 1 }}>
              {label}
            </Text>
            <Text variant="label" color={toneText(finish, c)} style={[{ fontWeight: "600" }, TABULAR]}>
              {pct(finish)}%
            </Text>
          </View>
        ))}
      </Divided>
      <Rule />
      <Text variant="caption" tone="3" style={{ paddingHorizontal: space[4], paddingVertical: space[3] }}>
        <Text variant="caption" tone="3" style={TABULAR}>
          {pct((100 * s.left) / s.total)}%
        </Text>{" "}
        of the grade is still to be marked.
      </Text>
    </Block>
  );
}

// ---------- semesters and changes ----------

function Semesters({ both }: { both: SemesterGrade[] }) {
  const c = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      {both.map((g, i) => (
        <View
          key={g.semester}
          style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}
          accessible
          accessibilityLabel={`Semester ${g.semester}: ${g.percent != null ? `${pct(g.percent)}%` : "no marks"}${g.letter ? `, ${g.letter}` : ""}`}
        >
          <Text variant="caption" tone="2" style={{ width: 82 }}>
            Semester {g.semester}
          </Text>
          <View style={{ flex: 1 }}>
            <Meter value={(g.percent ?? 0) / 100} color={g.percent != null ? toneFill(g.percent, c) : c.line} delay={staggerDelay(i)} />
          </View>
          <Text variant="label" color={g.percent != null ? toneText(g.percent, c) : c.text3} style={[{ width: 76, textAlign: "right", fontWeight: "600" }, TABULAR]}>
            {g.percent != null ? `${pct(g.percent)}%` : "No marks"}
            {g.letter ? <Text variant="label" tone="2">{` ${g.letter}`}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The grade's history as a log: the day, what was marked, and where the grade went. */
function Changes({ g, since, zone, today }: { g: SemesterGrade; since: number | null; zone: string; today: string }) {
  const c = useTheme();
  const changes = changesOf(g);
  const began = since ? shortDate(dayIn(zone, since)) : null;
  if (!changes.length)
    return (
      <Text variant="bodySm" tone="2">
        {began
          ? `Compass Neo has kept track of this grade since ${began}. New marks will show up here with the day they came in.`
          : "Compass Neo starts keeping this grade's history at the next sync. New marks will show up here with the day they came in."}
      </Text>
    );
  return (
    <View style={{ gap: space[3] }}>
      {changes.map((ch, i) => (
        <View key={ch.at} style={[{ flexDirection: "row", gap: space[3] }, i > 0 && { borderTopWidth: 1, borderTopColor: c.lineFaint, paddingTop: space[3] }]}>
          <Text variant="caption" tone="2" style={{ width: 78, fontWeight: "500" }}>
            {dayName(dayIn(zone, ch.at), today)}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            {ch.tasks.length > 0 ? (
              ch.tasks.map(t => (
                <Text key={t.id} variant="bodySm">
                  {t.name}{" "}
                  <Text variant="bodySm" tone="2" style={TABULAR}>
                    {t.was != null ? `changed from ${t.was} to ${t.mark}/${t.max}` : `marked ${t.mark}/${t.max}`}
                  </Text>
                </Text>
              ))
            ) : (
              <Text variant="bodySm">Connect updated the outline</Text>
            )}
            {ch.to != null && (
              <Text variant="caption" tone="2" style={TABULAR}>
                {ch.from != null ? `Grade ${pct(ch.from)}% to ` : "Grade now "}
                <Text variant="caption" color={toneText(ch.to, c)} style={{ fontWeight: "600" }}>
                  {pct(ch.to)}%
                </Text>
              </Text>
            )}
          </View>
        </View>
      ))}
      {began && (
        <Text variant="caption" tone="3">
          Kept since {began}; marks from before then have no day.
        </Text>
      )}
    </View>
  );
}
