import type { Transition } from "motion/react";

/**
 * The springs everything in the app moves on (the motion library's side of brand.css's --ease-spring). A spring keeps
 * its speed when it is interrupted, so a card tapped open and shut again turns around mid-flight instead of jumping.
 *
 * - morph: a box gliding and resizing from one place to another (a card growing into its view, a class moving slot).
 * - focus: something coming into focus where it sits: opacity, blur and a hair of scale. No bounce.
 * - snap: small parts that should land crisply (the day's label, a count).
 * - fold: a section folding open or shut.
 */
export const spring = {
  morph: { type: "spring", visualDuration: 0.34, bounce: 0.14 },
  focus: { type: "spring", visualDuration: 0.24, bounce: 0 },
  snap: { type: "spring", visualDuration: 0.22, bounce: 0.18 },
  /** The class panel sliding in at the side and the day moving aside for it, together. No bounce: an overshoot would
   * open a gap at the screen's edge. */
  panel: { type: "spring", visualDuration: 0.4, bounce: 0 },
  /** Folding open and shut: quick and plain, no spring to wait out. */
  fold: { type: "tween", duration: 0.18, ease: [0.2, 0.8, 0.2, 1] },
} satisfies Record<string, Transition>;

/** In and out of focus: from a soft blur and a little smaller, to sharp. */
export const focusIn = {
  initial: { opacity: 0, filter: "blur(8px)", scale: 0.96 },
  animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
  exit: { opacity: 0, filter: "blur(8px)", scale: 0.96 },
};
