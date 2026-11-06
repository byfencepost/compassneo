import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { ease, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { Icon } from "./glass";

/**
 * The one way anything in the app opens and shuts (a notice, a folded section, a row's detail), so every dropdown moves
 * alike: a short ease, no spring, no bounce, no fade, no zoom. Plain and quick, the way iOS's own disclosure rows go.
 */
// The web's spring.fold: 180ms on the house curve, both ways; shutting a touch quicker so it is out of the way.
const OPEN = timing.fold;
const SHUT = { duration: 150, easing: ease.out };

/**
 * What a row or a section holds when it opens: it grows to its own height (measured in a layer of its own), clipping
 * as it goes, and everything below moves down with it. Shutting runs back the same way, then lets the content go. While
 * open, a change in what it holds (a hand-in's next step, text landing) eases to the new height instead of jumping.
 * With Reduce Motion it simply opens and shuts.
 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const height = useSharedValue(0);
  const measured = useRef(false);
  const shown = useSharedValue(open ? 1 : 0);
  // Shut and let go: the next opening measures afresh.
  const letGo = () => {
    measured.current = false;
    setMounted(false);
  };
  useEffect(() => {
    if (open) shown.set(reduced ? 1 : withTiming(1, OPEN));
    else
      shown.set(
        withTiming(0, reduced ? { duration: 0 } : SHUT, done => {
          if (done) scheduleOnRN(letGo);
        }),
      );
  }, [open, reduced, shown]);
  const box = useAnimatedStyle(() => ({ height: height.get() * shown.get() }));
  if (!mounted) return null;
  return (
    <Animated.View style={[{ overflow: "hidden" }, box]}>
      <View
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          // The first measure is the height it opens to; later ones are its content changing while it is open.
          if (!measured.current || reduced) height.set(h);
          else height.set(withTiming(h, OPEN));
          measured.current = true;
        }}
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** A chevron that turns to point up when what it belongs to is open, on the same ease as the Fold. */
export function Chevron({ open, color, size = 12 }: { open: boolean; color?: string; size?: number }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const turn = useSharedValue(open ? 180 : 0);
  useEffect(() => {
    turn.set(reduced ? (open ? 180 : 0) : withTiming(open ? 180 : 0, open ? OPEN : SHUT));
  }, [open, reduced, turn]);
  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={anim}>
      <Icon ios="chevron.down" android="expand_more" size={size} color={color ?? c.text3} weight="semibold" />
    </Animated.View>
  );
}
