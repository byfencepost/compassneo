import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, G } from "react-native-svg";
import { dur, ease, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";

const R = 42;
const C = 2 * Math.PI * R;

const Arc = Animated.createAnimatedComponent(Circle);

/** The arc drawing itself in, the first time: a screen's content arriving (the long settle, no overshoot). */
const DRAW = { duration: dur.open, easing: ease.settle };

/**
 * A share out of 100 as a ring, as the web's Donut draws a grade: a track, and an arc round from twelve o'clock in the
 * ring's colour. The arc draws itself in once when it arrives (after `delay`, so a row of rings can follow one another)
 * and moves when the figure does, both on the settling ease (not a spring: Glaze's motion settles and never bounces),
 * and simply stands there for anyone who has asked their phone for less motion.
 * With no figure (a subject with nothing marked yet) it is an empty dashed ring. Drawn in the ring's own units, so a
 * small ring can carry a thicker stroke. Whatever is inside it (a glyph, a letter) sits in the middle.
 *
 * Only a picture: the row it sits in says the figure to a screen reader.
 */
export function Ring({
  percent,
  color,
  track,
  size = 44,
  thickness = 10,
  delay = 0,
  children,
}: {
  percent: number | null;
  color: string;
  /** The track under the arc; the theme's grey well by default. */
  track?: string;
  size?: number;
  thickness?: number;
  /** How long (ms) its first draw waits: a list's stagger (theme/motion.ts staggerDelay). */
  delay?: number;
  children?: ReactNode;
}) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const progress = useSharedValue(reduced ? p : 0);
  const drawn = useRef(false);

  useEffect(() => {
    if (reduced) progress.set(p);
    // Drawn in once; after that a new figure is a move from the old one, on the morph's settle.
    else progress.set(drawn.current ? withTiming(p, timing.settle) : withDelay(delay, withTiming(p, DRAW)));
    drawn.current = true;
  }, [p, reduced, progress, delay]);

  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - progress.get() / 100) }));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        {percent == null ? (
          <Circle cx={50} cy={50} r={R} fill="none" stroke={c.lineControl} strokeWidth={thickness * 0.6} strokeDasharray={[7, 7]} />
        ) : (
          <>
            <Circle cx={50} cy={50} r={R} fill="none" stroke={track ?? c.field} strokeWidth={thickness} />
            {/* A round cap on a zero arc would still draw a dot, so a 0 has only its track. */}
            {p > 0 && (
              <G rotation={-90} origin="50, 50">
                <Arc
                  cx={50}
                  cy={50}
                  r={R}
                  fill="none"
                  stroke={color}
                  strokeWidth={thickness}
                  strokeLinecap="round"
                  strokeDasharray={[C, C]}
                  animatedProps={arc}
                />
              </G>
            )}
          </>
        )}
      </Svg>
      {children}
    </View>
  );
}
