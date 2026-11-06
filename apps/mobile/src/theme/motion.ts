import { Easing, LinearTransition, withDelay, withSpring, withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";

/**
 * How the app moves, from the web's motion (apps/web/app/lib/neo/motion.ts and the Glaze tokens' --dur-* / --ease-*),
 * so the phone feels like the same thing: quick, smooth, settling, never bouncing about. Use these instead of numbers
 * of your own. Everything here respects the phone's Reduce Motion (Reanimated's layout animations do it themselves;
 * for hand-rolled shared values, check `useReducedMotion()` and jump).
 *
 * Two rules from Liquid Glass: never animate opacity on glass or on anything that holds glass (it breaks the effect),
 * so content holding glass uses `rise` (a move, no fade); content without glass may `focusIn`.
 */

/** The curves (Glaze's --ease-out, --ease-in, --ease-settle). */
export const ease = {
  /** The house curve: arrives fast, settles. Every transition. */
  out: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** Something leaving. */
  in: Easing.bezier(0.4, 0, 1, 1),
  /** A long arrival: fast, then a slow settle, no overshoot (a screen's content, a needle finding north). */
  settle: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

/** How long (ms), as the web's --dur-* tokens. */
export const dur = {
  /** A press going down on glass. */
  press: 50,
  /** Glass coming back up after a press. */
  release: 200,
  /** A state change: a colour, a check, a count. */
  state: 160,
  /** A selection mark sliding to its new place: a segmented thumb, a tab. */
  slide: 200,
  /** Folding open or shut. */
  fold: 180,
  /** One state becoming the next: a box gliding to its new place and size. */
  morph: 420,
  /** A screen's content arriving. */
  open: 700,
} as const;

/** Timing configs to hand to withTiming. */
export const timing = {
  state: { duration: dur.state, easing: ease.out },
  slide: { duration: dur.slide, easing: ease.out },
  fold: { duration: dur.fold, easing: ease.out },
  out: { duration: dur.state, easing: ease.in },
  settle: { duration: dur.morph, easing: ease.settle },
} as const;

/**
 * The springs (the web's spring.* in motion.ts; a spring keeps its speed when interrupted, so a thing turned back
 * mid-flight turns around instead of jumping). `duration` is the perceived length; dampingRatio 1 means no overshoot.
 * - morph: a box gliding and resizing to a new place (a card, a thumb, a row moving), a hair of overshoot.
 * - focus: coming into focus where it sits: scale and opacity. No bounce.
 * - snap: a small part landing crisply (a count, a check), a touch of give.
 * - panel: a large surface sliding (a day turning). No bounce: an overshoot would open a gap at the edge.
 */
export const springs = {
  morph: { duration: 340, dampingRatio: 0.88 },
  focus: { duration: 240, dampingRatio: 1 },
  snap: { duration: 220, dampingRatio: 0.84 },
  panel: { duration: 400, dampingRatio: 1 },
} as const;

/** How far apart a list's rows start arriving, and the most rows that wait (the rest arrive with the last). */
const STAGGER = 28;
const STAGGER_MAX = 8;
export const staggerDelay = (i: number) => Math.min(i, STAGGER_MAX) * STAGGER;

/**
 * Content without glass coming into focus where it sits (the web's focusIn, without the blur): from a little smaller
 * and clear, to full size and solid. `index` staggers a list's rows.
 */
export function focusIn(index = 0): EntryExitAnimationFunction {
  const delay = staggerDelay(index);
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ scale: 0.97 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 240, easing: ease.out })),
        transform: [{ scale: withDelay(delay, withSpring(1, springs.focus)) }],
      },
    };
  };
}

/** Content that holds glass arriving: a short rise into place, no fade (glass must never sit under opacity). */
export function rise(index = 0, from = 10): EntryExitAnimationFunction {
  const delay = staggerDelay(index);
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateY: from }] },
      animations: { transform: [{ translateY: withDelay(delay, withTiming(0, { duration: dur.morph, easing: ease.settle })) }] },
    };
  };
}

/** Content without glass leaving: a quick fade, so what replaces it is what the eye follows. */
export function focusOut(): EntryExitAnimationFunction {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 1 },
      animations: { opacity: withTiming(0, { duration: 120, easing: ease.in }) },
    };
  };
}

/** Whatever moves because something above it changed size glides to its new place on the morph spring. */
export const glide = LinearTransition.springify().duration(springs.morph.duration).dampingRatio(springs.morph.dampingRatio);
