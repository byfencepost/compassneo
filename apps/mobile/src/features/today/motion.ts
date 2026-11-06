import { withSpring, withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { dur, ease, focusOut, springs, timing } from "@/theme/motion";

/**
 * How the day moves, on the app's motion (theme/motion.ts, the web's), in one place so it moves as one thing: quick,
 * settling, never bouncing. A day can hold Liquid Glass (a note's button), and glass under a parent at less than full
 * opacity loses its look, so a day with glass only ever moves; one without may fade as it goes, as the web's day does.
 */

export const timings = {
  /** A press: the wash comes in and goes out on the state ease, as a row on the web lights (--dur-state, --ease-out). */
  press: timing.state,
  /** A dragged day let go of, sliding back to where it sits. */
  settle: timing.slide,
  /** Something drawn in as it arrives (a grade's arc, the lesson on now's progress), and moved when its figure does. */
  draw: { duration: dur.open, easing: ease.settle },
} as const;

/** How far a new day starts from where it lands: enough to say which way it came, no more. */
const SLIDE = 24;

const dayIn =
  (dir: -1 | 1, fade: boolean): EntryExitAnimationFunction =>
  () => {
    "worklet";
    const slide = { transform: [{ translateX: withSpring(0, springs.panel) }] };
    return fade
      ? { initialValues: { opacity: 0, transform: [{ translateX: dir * SLIDE }] }, animations: { opacity: withTiming(1, timing.state), ...slide } }
      : { initialValues: { transform: [{ translateX: dir * SLIDE }] }, animations: slide };
  };

const DAY_IN = { plain: { [-1]: dayIn(-1, true), 1: dayIn(1, true) }, glass: { [-1]: dayIn(-1, false), 1: dayIn(1, false) } } as const;
const LEAVE = focusOut();

/**
 * A day coming in: from the right when you went forward, from the left when you went back, on the panel spring, and
 * simply there when the day changed under you (midnight, the first paint). One holding glass only slides; one without
 * comes into view as it slides.
 */
export const dayEntering = (dir: -1 | 0 | 1, glass: boolean) => (dir === 0 ? undefined : DAY_IN[glass ? "glass" : "plain"][dir]);

/**
 * The day going out: a quick fade where it stands, so the new one is what the eye follows. One holding glass is gone at
 * once instead (glass must never fade).
 */
export const dayExiting = (glass: boolean) => (glass ? undefined : LEAVE);

/** How far the day's name moves as it changes: as far as `rise` lifts a thing. */
const LIFT = 10;

const labelIn =
  (dir: -1 | 1): EntryExitAnimationFunction =>
  () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: dir * LIFT }] },
      animations: { opacity: withTiming(1, timing.state), transform: [{ translateY: withSpring(0, springs.snap) }] },
    };
  };

/**
 * The picker's day name changing, as the web's day label turns: the new one comes up from below when you went forward,
 * down from above when you went back, on the snap spring, while the old one fades where it stood.
 */
export const labelEntering = { [-1]: labelIn(-1), 0: undefined, 1: labelIn(1) } as const;
export const labelExiting = LEAVE;
