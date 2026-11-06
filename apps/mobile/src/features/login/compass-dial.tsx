import { useEffect, useId, useRef } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { MARK, MARK_VIEWBOX } from "@/components/brand/paths";
import { useTheme } from "@/theme/theme";

/** The sync gauge's span on the dial, centred on north. As the web's --neo-sweep. */
export const SWEEP = 150;

/** The web's compass motion (glaze/tokens.css): the needle finding north, the bezel drawing itself, a gauge step. */
const NEEDLE_MS = 1200;
const BEZEL_MS = 1400;
const GAUGE_MS = 630;
/** --ease-settle: fast, then a long slow settle with no overshoot, like a needle finding north. */
const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);
/** A new heading is a swing on a damped spring, a few per cent past the mark and back (--ease-spring). */
const SWING = { duration: 520, dampingRatio: 0.72 } as const;
/** How far round the bezel draws from north, each way: past due east and west, as on the web. */
const ARC = 190;

/**
 * What the needle does between headings. rest: wanders a degree or two, as a real one never sits still. wait:
 * trembles while something slow happens (the sync). still: holds its heading (it has found north).
 */
export type NeedleMood = "rest" | "wait" | "still";

// ---------- the bezel's geometry, in the web's 200-unit viewBox (components/brand/logo.tsx) ----------

const C = 100;
type Tick = { bearing: number; major: boolean; x: number; y: number; length: number; fade: number };

/** Only the upper arc shows: bearings fade out from 30% of the way down the bezel and are gone by 62%. */
const fadeAt = (f: number) => (f <= 0.3 ? 1 : f >= 0.62 ? 0 : 1 - (f - 0.3) / 0.32);

/** The 72 bearings, every fifth degree with the 30° ones longer, less the ones the fade hides anyway. */
const TICKS: Tick[] = (() => {
  const out: Tick[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const bearing = deg > 180 ? deg - 360 : deg;
    const major = deg % 30 === 0;
    const [r1, r2] = major ? [89, 96] : [92, 96];
    const mid = (r1 + r2) / 2;
    const a = (bearing * Math.PI) / 180;
    const y = C - mid * Math.cos(a);
    const fade = fadeAt(y / 200);
    if (fade > 0) out.push({ bearing, major, x: C + mid * Math.sin(a), y, length: r2 - r1, fade });
  }
  return out;
})();

/**
 * The compass at the top of the sign-in: a ring of bearings drawn in hairlines, and the mark at its centre with a
 * needle that turns. The web's NeoMark and Bezel (apps/web/app/components/brand/logo.tsx) in native views.
 *
 * On arrival the bezel draws itself out from north while the needle swings in from west of north and settles. After
 * that `heading` (degrees, 0 is north) is sprung to, so each step of the sync is one swing. `gauge` is the sync's
 * progress drawn on the dial: the bearings in Neo blue, from the west end of the upper arc toward the needle.
 *
 * The needle sits in its own view, turned about the mark's centre: the dial's gradient and rim stay put, as on a real
 * compass. The bearings are views as well, each animated on the UI thread; nothing here re-renders while it moves.
 */
export function CompassDial({
  size,
  mark,
  heading,
  gauge,
  mood,
}: {
  /** The bezel's diameter; the box is only as tall as its upper half and the mark. */
  size: number;
  /** The mark's size. */
  mark: number;
  heading: number;
  /** Degrees of the sweep lit, 0 to SWEEP. */
  gauge: number;
  mood: NeedleMood;
}) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const k = size / 200;

  const turn = useSharedValue(-72);
  const wobble = useSharedValue(0);
  const arc = useSharedValue(0);
  const lit = useSharedValue(0);
  const arrived = useRef(false);

  // Reduce Motion: every timing and spring below jumps straight to its end (Reanimated's ReduceMotion.System).
  useEffect(() => {
    arc.set(withTiming(ARC, { duration: BEZEL_MS, easing: SETTLE }));
  }, [arc]);

  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      turn.set(withTiming(heading, { duration: NEEDLE_MS, easing: SETTLE }));
    } else turn.set(withSpring(heading, SWING));
  }, [heading, turn]);

  useEffect(() => {
    lit.set(withTiming(gauge, { duration: GAUGE_MS, easing: SETTLE }));
  }, [gauge, lit]);

  useEffect(() => {
    if (reduced || mood === "still") {
      wobble.set(withTiming(0, { duration: 300, easing: SETTLE }));
      return;
    }
    // The web's neo-needle-wander (6s, -2° to 2.5°) and neo-needle-tremble (1.68s, ±1.5°).
    const [lo, hi, half, delay] = mood === "wait" ? [-1.5, 1.5, 840, 0] : [-2, 2.5, 3000, NEEDLE_MS];
    const ease = Easing.inOut(Easing.sin);
    wobble.set(
      withDelay(
        delay,
        withSequence(
          withTiming(lo, { duration: half / 2, easing: ease }),
          withRepeat(withSequence(withTiming(hi, { duration: half, easing: ease }), withTiming(lo, { duration: half, easing: ease })), -1),
        ),
      ),
    );
    return () => cancelAnimation(wobble);
  }, [mood, reduced, wobble]);

  const needle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() + wobble.get()}deg` }] }));
  const rings = useAnimatedStyle(() => ({ opacity: Math.min(1, arc.get() / 60) }));

  const at = size / 2 - mark / 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size / 2 + mark / 2, pointerEvents: "none" }}
    >
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: size, height: size }, rings]}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
              {/* The line colour as ink at its own strength: react-native-svg drops the alpha of an rgba stopColor and
                  keeps only stopOpacity, so c.line (10% ink) given straight in drew the rings in full white. */}
              <Stop offset="0.3" stopColor={c.ink} stopOpacity={0.1} />
              <Stop offset="0.62" stopColor={c.ink} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* Two hairline rings in the line colour, fading out down the bezel with the bearings. */}
          <Circle cx={C} cy={C} r={98} stroke={`url(#${id}f)`} strokeWidth={1 / k} fill="none" />
          <Circle cx={C} cy={C} r={72} stroke={`url(#${id}f)`} strokeWidth={1 / k} fill="none" />
          <Path d="M100 1.6 L102.6 7 L97.4 7 Z" fill={c.needle} />
        </Svg>
      </Animated.View>

      {TICKS.map(t => (
        <Bearing key={t.bearing} tick={t} k={k} arc={arc} lit={lit} base={t.major ? c.lineControl : c.line} on={c.neo} />
      ))}

      <View style={{ position: "absolute", top: at, left: at }}>
        <Svg width={mark} height={mark} viewBox={MARK_VIEWBOX}>
          <Defs>
            <LinearGradient id={`${id}d`} x1="7.616" y1="7.616" x2="44.384" y2="44.384" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={c.neo} stopOpacity={0.95} />
              <Stop offset="1" stopColor={c.neo} stopOpacity={0.5} />
            </LinearGradient>
            <LinearGradient id={`${id}r`} x1="7.616" y1="7.616" x2="44.384" y2="44.384" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.6} />
              <Stop offset="0.493" stopColor="#fff" stopOpacity={0} />
              <Stop offset="0.997" stopColor="#fff" stopOpacity={0.3} />
            </LinearGradient>
          </Defs>
          <Path d={MARK.dial} fill={`url(#${id}d)`} />
          <Path d={MARK.rim} fill={`url(#${id}r)`} />
        </Svg>
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: mark, height: mark }, needle]}>
          <Svg width={mark} height={mark} viewBox={MARK_VIEWBOX}>
            <Defs>
              <LinearGradient id={`${id}s`} x1="19.5408" y1="25.4765" x2="32.4811" y2="38.4163" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#fff" stopOpacity={0.8} />
                <Stop offset="0.519" stopColor="#fff" stopOpacity={0.5} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0.6} />
              </LinearGradient>
              <LinearGradient id={`${id}n`} x1="19.5374" y1="13.6024" x2="32.4776" y2="26.5422" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={c.needle} stopOpacity={0.95} />
                <Stop offset="1" stopColor={c.needle} stopOpacity={0.5} />
              </LinearGradient>
            </Defs>
            <Path d={MARK.south} fill={`url(#${id}s)`} />
            <Path d={MARK.north} fill={`url(#${id}n)`} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * One bearing on the bezel: shown once the drawing has reached it (out from north, both ways at once), and lit in Neo
 * blue, a touch heavier, once the sync gauge has passed it.
 */
function Bearing({
  tick,
  k,
  arc,
  lit,
  base,
  on,
}: {
  tick: Tick;
  k: number;
  arc: SharedValue<number>;
  lit: SharedValue<number>;
  base: string;
  on: string;
}) {
  const width = tick.major ? 1.5 : 1;
  const height = tick.length * k;
  const { bearing, fade } = tick;
  // How far into the gauge this bearing sits; bearings outside the sweep never light.
  const into = Math.abs(bearing) <= SWEEP / 2 ? bearing + SWEEP / 2 : null;
  const style = useAnimatedStyle(() => {
    const drawn = Math.min(1, Math.max(0, (arc.get() - Math.abs(bearing)) / 10));
    const g = lit.get();
    const glow = into == null || g <= 0 ? 0 : Math.min(1, Math.max(0, (g - into) / 5 + 1));
    return {
      opacity: drawn * fade,
      backgroundColor: interpolateColor(glow, [0, 1], [base, on]),
      transform: [{ rotate: `${bearing}deg` }, { scaleX: 1 + glow * 0.5 }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: tick.x * k - width / 2,
          top: tick.y * k - height / 2,
          width,
          height,
          borderRadius: width / 2,
        },
        style,
      ]}
    />
  );
}
