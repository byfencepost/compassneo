import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Animated, {
  LayoutAnimationConfig,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type EntryExitAnimationFunction,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Line as SvgLine, LinearGradient, Path, Stop } from "react-native-svg";
import { Segmented } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { Swap } from "@/features/grades/moving";
import { longDay, shortDate } from "@/lib/days";
import { dur, ease, focusOut, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { attendanceTone, markColor, markLabel, markOf, mondayOf, pctText, tabular, toneText, weekdayIndex, type Mark } from "./format";
import { ROW_X, ROW_Y, Section, Swatch } from "./parts";

/**
 * Attendance over weeks, ported from the web's attendance page (apps/web/app/features/student/attendance.tsx): the
 * span's share present week by week as a line, and a term as a calendar of its periods. Both read the same shape of
 * days: Compass's rolls (any term, or the year) or Connect's term grid.
 */

/** A school day period by period: Connect's term grid, or Compass's rolls (which also say the class and the reason). */
export type Day = { date: string; periods: { period: number; code: string; name: string; reason?: string | null; class?: string }[] };
type Marked = Day["periods"][number] & { mark: Mark };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PLOT_H = 144;
/** Room inside the plot's top and bottom, so a dot at 100% is never cut in half. */
const PAD = 6;
/** Room at the plot's end for the scale's figures. */
const GUTTER = 28;
const HI = 100;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The line drawing itself in from the left as the chart arrives, as the web's clip opens: the house curve. */
const DRAW = { duration: dur.open, easing: ease.out };

/**
 * The scale's lines and figures for the other view coming in: a plain fade on a state change's ease, while the old
 * ones fade out (no scale, as a grid that grew would seem to breathe).
 */
const fadeIn: EntryExitAnimationFunction = () => {
  "worklet";
  return { initialValues: { opacity: 0 }, animations: { opacity: withTiming(1, timing.state) } };
};

type Scale = { lo: number; ticks: number[] };

/** A scale that fits a line: its floor a step under the line's lowest point, its lines (every other one when there are many), and 100 at the top. */
function scaleFor(values: number[]): Scale {
  const spread = HI - Math.min(...values);
  const step = spread <= 8 ? 2 : spread <= 20 ? 5 : 10;
  const lo = Math.max(0, Math.floor((Math.min(...values) - step / 2) / step) * step);
  const ticks: number[] = [];
  for (let v = HI - step; v > lo; v -= step) ticks.push(v);
  return { lo, ticks: [...(ticks.length > 3 ? ticks.filter((_, i) => i % 2 === 1) : ticks), HI] };
}

// ---------- week by week ----------

type Week = { monday: string; week: number; term: number };

/**
 * Attendance over the span week by week, as one line: Overall (the share present so far, week on week, the default) or
 * Each week (that week's own share). The scale fits the line shown. Many weeks (the year) are labelled by month; a
 * term's by week number. A finger on the line picks a week, said under it; the latest is said until then.
 *
 * As it arrives the line draws itself in from the left, as the web's does. Switched between Overall and Each week, the
 * line moves from the one to the other, its points gliding to their new heights, and the scale's lines fade across.
 */
export function WeekChart({ days, label, accent, arrive }: { days: Day[]; label: string; accent: string; arrive?: number }) {
  const byWeek = new Map<string, { present: number; marked: number }>();
  for (const d of [...days].filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date))) {
    if (weekdayIndex(d.date) > 4) continue;
    const w = byWeek.get(mondayOf(d.date)) ?? { present: 0, marked: 0 };
    for (const p of d.periods) {
      const m = markOf(p.code, p.name);
      if (m === "none") continue;
      w.marked += 1;
      if (m === "present") w.present += 1;
    }
    byWeek.set(mondayOf(d.date), w);
  }
  let runPresent = 0;
  let runMarked = 0;
  const weeks: Week[] = [...byWeek.entries()]
    .filter(([, w]) => w.marked > 0)
    .map(([monday, w]) => {
      runPresent += w.present;
      runMarked += w.marked;
      return { monday, week: (100 * w.present) / w.marked, term: (100 * runPresent) / runMarked };
    });
  if (weeks.length < 2) return null;
  return <Weeks weeks={weeks} label={label} accent={accent} arrive={arrive} />;
}

function Weeks({ weeks, label, accent, arrive }: { weeks: Week[]; label: string; accent: string; arrive?: number }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [on, setOn] = useState<number | null>(null);
  const [mode, setMode] = useState<"overall" | "week">("overall");

  // How far the line has gone from Overall (0) to Each week (1), and how much of the plot has drawn in (0 to 1).
  const morph = useSharedValue(0);
  const drawn = useSharedValue(reduced ? 1 : 0);
  const measured = width > 0;
  useEffect(() => {
    const to = mode === "week" ? 1 : 0;
    morph.set(reduced ? to : withTiming(to, timing.settle));
  }, [mode, reduced, morph]);
  useEffect(() => {
    if (measured) drawn.set(reduced ? 1 : withTiming(1, DRAW));
  }, [measured, reduced, drawn]);

  const n = weeks.length;
  // Each view's own scale, so each line fills the plot; the line moves between their heights.
  const scales = { overall: scaleFor(weeks.map(w => w.term)), week: scaleFor(weeks.map(w => w.week)) };
  const scale = scales[mode];
  const plotW = Math.max(0, width - GUTTER);
  const xAt = (i: number) => plotW * (0.03 + (0.94 * i) / (n - 1));
  const yAt = (v: number, s: Scale) => PAD + (PLOT_H - 2 * PAD) * (1 - (Math.max(s.lo, Math.min(HI, v)) - s.lo) / (HI - s.lo));
  const xs = weeks.map((_, i) => xAt(i));
  const overall = weeks.map(w => yAt(w.term, scales.overall));
  const each = weeks.map(w => yAt(w.week, scales.week));

  const clip = useAnimatedStyle(() => ({ width: drawn.get() * width }));
  const lineProps = useAnimatedProps(() => {
    const t = morph.get();
    let d = "";
    for (let i = 0; i < xs.length; i++) d += `${i ? "L" : "M"}${xs[i]!.toFixed(1)} ${(overall[i]! + (each[i]! - overall[i]!) * t).toFixed(1)}`;
    return { d };
  });
  const areaProps = useAnimatedProps(() => {
    const t = morph.get();
    let d = "";
    for (let i = 0; i < xs.length; i++) d += `${i ? "L" : "M"}${xs[i]!.toFixed(1)} ${(overall[i]! + (each[i]! - overall[i]!) * t).toFixed(1)}`;
    return { d: `${d} L${xs[xs.length - 1]!.toFixed(1)} ${PLOT_H} L${xs[0]!.toFixed(1)} ${PLOT_H} Z` };
  });

  const last = weeks[n - 1]!;
  const shown = weeks[on ?? n - 1]!;

  // Labels under the line: by month when there are many weeks (a year), else every few week numbers.
  const month = (day: string) => shortDate(day).split(" ")[1]!;
  const every = Math.max(1, Math.ceil(n / 6));
  const labels = weeks.map((w, i) =>
    n > 14 ? (i === 0 || month(w.monday) !== month(weeks[i - 1]!.monday) ? month(w.monday) : null) : i % every === 0 || i === n - 1 ? `W${i + 1}` : null,
  );
  // Months that start a week apart would collide: keep one label per few weeks.
  let lastShown = -Infinity;
  const spaced = labels.map((l, i) => {
    if (!l || i - lastShown < Math.max(2, Math.ceil(n / 7))) return null;
    lastShown = i;
    return l;
  });

  const pick = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
    setOn(best);
  };
  // The scale's lines and figures change only when the scale does: then they fade across.
  const scaleKey = `${scale.lo}:${scale.ticks.join(",")}`;

  return (
    <Section
      glyph="chart"
      title={`${label} week by week`}
      accent={accent}
      arrive={arrive}
      glass
      aside={
        <Text variant="caption" color={toneText(attendanceTone(last.term), c)} style={[tabular, { fontWeight: "500" }]}>
          {pctText(last.term)}% so far
        </Text>
      }
      panelStyle={{ paddingHorizontal: ROW_X, paddingTop: space[4], paddingBottom: space[3] }}
    >
      <View
        accessible
        accessibilityLabel={`Attendance by week, from ${pctText(weeks[0]!.week)}% in the week of ${shortDate(weeks[0]!.monday)} to ${pctText(last.week)}% in the week of ${shortDate(last.monday)}; ${pctText(last.term)}% so far.`}
      >
        <View
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderGrant={pick}
          onResponderMove={pick}
          onResponderTerminationRequest={() => true}
          style={{ height: PLOT_H }}
        >
          {measured && (
            <>
              {/* The plot, drawn in from the left by a clip that opens across it. */}
              <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, bottom: 0, overflow: "hidden" }, clip]}>
                <View style={{ width, height: PLOT_H }}>
                  <LayoutAnimationConfig skipEntering skipExiting>
                    <Animated.View key={scaleKey} entering={fadeIn} exiting={focusOut()} style={StyleSheet.absoluteFill}>
                      <Svg width={width} height={PLOT_H}>
                        {scale.ticks.map(v => (
                          <SvgLine key={v} x1={0} x2={plotW} y1={yAt(v, scale)} y2={yAt(v, scale)} stroke={c.line} strokeWidth={1} strokeDasharray={[2, 4]} />
                        ))}
                      </Svg>
                    </Animated.View>
                  </LayoutAnimationConfig>
                  <Svg width={width} height={PLOT_H} style={StyleSheet.absoluteFill}>
                    <Defs>
                      <LinearGradient id="att-area" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity={0.22} />
                        <Stop offset="1" stopColor={accent} stopOpacity={0} />
                      </LinearGradient>
                    </Defs>
                    <AnimatedPath fill="url(#att-area)" animatedProps={areaProps} />
                    {on != null && <SvgLine x1={xAt(on)} x2={xAt(on)} y1={0} y2={PLOT_H} stroke={c.lineControl} strokeWidth={1} />}
                    <AnimatedPath fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" animatedProps={lineProps} />
                    {weeks.map((w, i) =>
                      n <= 20 || on === i ? (
                        <Dot key={w.monday} x={xs[i]!} from={overall[i]!} to={each[i]!} morph={morph} big={on === i} fill={on === i ? accent : c.paper} stroke={accent} />
                      ) : null,
                    )}
                  </Svg>
                </View>
              </Animated.View>
              <LayoutAnimationConfig skipEntering skipExiting>
                <Animated.View key={scaleKey} entering={fadeIn} exiting={focusOut()} pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {scale.ticks.map(v => (
                    <Text key={v} variant="caption" tone="3" style={[tabular, { position: "absolute", right: 0, top: yAt(v, scale) - 8, fontSize: 11, lineHeight: 16 }]}>
                      {v}
                    </Text>
                  ))}
                </Animated.View>
              </LayoutAnimationConfig>
            </>
          )}
        </View>
        <View style={{ height: 16, marginTop: space[1.5] }}>
          {measured &&
            weeks.map((w, i) =>
              spaced[i] ? (
                <Text
                  key={w.monday}
                  variant="caption"
                  tone={on === i ? "1" : "3"}
                  style={[tabular, { position: "absolute", left: xAt(i) - 20, width: 40, textAlign: "center", fontSize: 11, lineHeight: 16 }]}
                >
                  {spaced[i]}
                </Text>
              ) : null,
            )}
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], marginTop: space[3] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" style={{ fontWeight: "500" }} numberOfLines={1}>
            Week of {shortDate(shown.monday)}
          </Text>
          <Text variant="caption" tone="2" style={tabular} numberOfLines={1}>
            {pctText(shown.term)}% so far · {pctText(shown.week)}% that week
          </Text>
        </View>
        <Segmented
          size="sm"
          label="Show"
          value={mode}
          onChange={setMode}
          options={[
            { value: "overall", label: "Overall" },
            { value: "week", label: "Each week" },
          ]}
        />
      </View>
    </Section>
  );
}

/** A week's point on the line, moving with it between Overall and Each week. */
function Dot({ x, from, to, morph, big, fill, stroke }: { x: number; from: number; to: number; morph: SharedValue<number>; big: boolean; fill: string; stroke: string }) {
  const props = useAnimatedProps(() => ({ cy: from + (to - from) * morph.get() }));
  return <AnimatedCircle cx={x} r={big ? 4.5 : 3} fill={fill} stroke={stroke} strokeWidth={2} animatedProps={props} />;
}

// ---------- period by period ----------

/**
 * A term as a calendar: a row a week, a column a weekday, and in each day its periods top to bottom as small bars in
 * their mark's colour. Periods never marked all term (before school, recess, lunch) are left out. A day picked (the
 * latest with something to note, to start) says what its marks were under the grid; another day picked, what it says
 * gives way to that day's in place.
 */
export function PeriodGrid({ days: all, label, accent, arrive }: { days: Day[]; label: string; accent: string; arrive?: number }) {
  const c = useTheme();
  const days = all.filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date));
  const periods = [...new Set(days.flatMap(d => d.periods.filter(p => p.code !== "-").map(p => p.period)))].sort((a, b) => a - b);
  const marksOf = (d: Day): Marked[] =>
    periods.map(n => {
      const p = d.periods.find(x => x.period === n);
      return p ? { ...p, mark: markOf(p.code, p.name) } : { period: n, code: "-", name: "Not recorded", mark: "none" };
    });
  const notable = (d: Day) => marksOf(d).filter(p => p.mark !== "present" && p.mark !== "none");

  const weeks: { monday: string; slots: (Day | null)[] }[] = [];
  for (const d of days) {
    const i = weekdayIndex(d.date);
    if (i > 4) continue;
    const monday = mondayOf(d.date);
    let w = weeks[weeks.length - 1];
    if (!w || w.monday !== monday) weeks.push((w = { monday, slots: [null, null, null, null, null] }));
    w.slots[i] = d;
  }

  // The key: each mark seen in the grid and how many periods had it, present first.
  const counts = new Map<string, { name: string; mark: Mark; n: number }>();
  for (const d of days)
    for (const p of marksOf(d)) {
      const k = p.mark === "none" ? "-" : p.code;
      const e = counts.get(k) ?? { name: p.mark === "none" ? "Not marked" : p.name, mark: p.mark, n: 0 };
      e.n += 1;
      counts.set(k, e);
    }
  const order: Mark[] = ["present", "late", "authorised", "absent", "other", "none"];
  const key = [...counts.values()].sort((a, b) => order.indexOf(a.mark) - order.indexOf(b.mark) || b.n - a.n);
  const recorded = key.filter(k => k.mark !== "none").reduce((a, k) => a + k.n, 0);
  const present = key.filter(k => k.mark === "present").reduce((a, k) => a + k.n, 0);
  const share = recorded ? (100 * present) / recorded : null;

  const latest = days[days.length - 1];
  const start = [...days].reverse().find(d => notable(d).length > 0) ?? latest;
  const [picked, setPicked] = useState<string | null>(null);
  const sel = days.find(d => d.date === picked) ?? start;
  if (!sel || !periods.length) return null;

  const describe = (d: Day) => {
    const n = notable(d);
    if (n.length) return n.map(p => `period ${p.period} ${p.name.toLowerCase()}`).join(", ");
    return marksOf(d).some(p => p.mark === "none") ? "present at every period marked" : "present all day";
  };
  const selMarks = notable(sel);

  return (
    <Section
      glyph="grid"
      title={`${label} by period`}
      accent={accent}
      arrive={arrive}
      aside={
        share != null && (
          <Text variant="caption" color={toneText(attendanceTone(share), c)} style={[tabular, { fontWeight: "500" }]}>
            {pctText(share)}% present
          </Text>
        )
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space[3], rowGap: space[1], paddingHorizontal: ROW_X, paddingVertical: ROW_Y, borderBottomWidth: 1, borderBottomColor: c.lineFaint }}>
        {key.map(k => (
          <View key={`${k.mark}:${k.name}`} style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
            <Swatch color={markColor(k.mark, c)} hollow={k.mark === "none"} />
            <Text variant="caption" tone="2">
              {markLabel(k.name)}
            </Text>
            <Text variant="caption" tone="3" style={tabular}>
              {k.n}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: ROW_X, paddingTop: ROW_Y, paddingBottom: space[3], gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <View style={{ width: 44 }} />
          {WEEKDAYS.map(w => (
            <Text key={w} variant="caption" tone="3" style={{ flex: 1, textAlign: "center", fontSize: 11, lineHeight: 15 }}>
              {w}
            </Text>
          ))}
        </View>
        {weeks.map(w => (
          <View key={w.monday} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text variant="caption" tone="3" numberOfLines={1} style={[tabular, { width: 44, fontSize: 11, lineHeight: 15 }]}>
              {shortDate(w.monday)}
            </Text>
            {w.slots.map((d, i) =>
              d ? (
                <Pressable
                  key={d.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${longDay(d.date)}: ${describe(d)}`}
                  accessibilityState={{ selected: d === sel }}
                  onPress={() => setPicked(d.date)}
                  style={{
                    flex: 1,
                    gap: 2,
                    padding: 4,
                    borderRadius: 7,
                    backgroundColor: d === sel ? c.field : "transparent",
                    borderWidth: 1,
                    borderColor: d === sel ? c.lineControl : "transparent",
                  }}
                >
                  {marksOf(d).map(p => (
                    <View key={p.period} style={{ height: 5, borderRadius: 2, backgroundColor: markColor(p.mark, c) }} />
                  ))}
                </Pressable>
              ) : (
                <View key={`${w.monday}-${i}`} style={{ flex: 1 }} />
              ),
            )}
          </View>
        ))}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: c.lineFaint, paddingHorizontal: ROW_X, paddingVertical: ROW_Y }}>
        <Swap id={sel.date} style={{ gap: space[1] }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[3] }}>
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {longDay(sel.date)}
            </Text>
            {selMarks.length === 0 && (
              <Text variant="caption" tone="ok" style={{ fontWeight: "500" }}>
                {marksOf(sel).some(p => p.mark === "none") ? "Present every period marked" : "Present all day"}
              </Text>
            )}
          </View>
          {selMarks.map(p => (
            <View key={p.period} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <Swatch color={markColor(p.mark, c)} />
              <Text variant="caption" style={{ fontWeight: "500" }}>
                Period {p.period}
              </Text>
              {p.class != null && (
                <Text variant="caption" style={{ fontWeight: "500" }} numberOfLines={1}>
                  {p.class}
                </Text>
              )}
              <Text variant="caption" tone="2" numberOfLines={1} style={{ flex: 1 }}>
                {p.name}
                {p.reason ? <Text variant="caption" tone="3">{` · ${p.reason}`}</Text> : null}
              </Text>
            </View>
          ))}
        </Swap>
      </View>
    </Section>
  );
}
