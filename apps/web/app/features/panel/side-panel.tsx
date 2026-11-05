import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { spring } from "@/lib/neo/motion";

/** At this width and up the panel floats beside the day and pushes it aside; under it (a phone), it covers the screen. */
const WIDE = "(min-width: 760px)";
/** The panel's margin from the window's edge (class.css), and the space kept between it and the day. */
const EDGE = 12;
const GAP = 12;
/** The least the day keeps beside an expanded panel. Under it the expanded panel floats over the day instead. */
const DAY_MIN = 560;

export type PanelLayout = {
  /** The panel sits beside the day (a wide screen), not over the whole screen (a phone). */
  wide: boolean;
  /** The usual width, a little over a third of the window, and the room the day gives it (width, margin and gap). */
  width: number;
  room: number;
  /** Expanded (a class's Files): most of the window. */
  wideWidth: number;
  wideRoom: number;
  /** The window has room to keep the day beside an expanded panel; without it, the panel floats over the day. */
  pushWide: boolean;
};

/** The app's size knob (--ui-scale in tokens.css): 1 on a phone, bigger on a computer screen. */
export function uiScale() {
  if (typeof document === "undefined") return 1;
  const el = document.querySelector(".glaze") ?? document.documentElement;
  const n = Number.parseFloat(getComputedStyle(el).getPropertyValue("--ui-scale"));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function usePanelLayout(): PanelLayout {
  const read = (): PanelLayout => {
    if (typeof window === "undefined") return { wide: false, width: 420, room: 444, wideWidth: 420, wideRoom: 444, pushWide: false };
    const vw = window.innerWidth;
    // The panel grows with the rest of the app (uiScale), never past what the window holds beside the day.
    const k = uiScale();
    const width = Math.round(Math.min(500 * k, Math.max(380 * k, vw * 0.38), vw * 0.5));
    const wideWidth = Math.round(Math.max(width, Math.min(860 * k, vw * 0.62, vw - 2 * EDGE)));
    return {
      wide: window.matchMedia(WIDE).matches,
      width,
      room: width + EDGE + GAP,
      wideWidth,
      wideRoom: wideWidth + EDGE + GAP,
      pushWide: vw - (wideWidth + EDGE + GAP) >= DAY_MIN * k,
    };
  };
  const [layout, setLayout] = useState(read);
  useEffect(() => {
    const on = () => setLayout(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return layout;
}

/**
 * Which panel home has open ("class-panel", "student-panel") or null. The class panel and the student's pages are two
 * panels in one place: going from one to the other swaps them where they stand (the old one fades out as the new one
 * fades in) instead of one sliding out while the other slides in across it.
 */
export const ActivePanel = createContext<string | null>(null);

const slide = {
  in: (swap: boolean) => (swap ? { x: 0, opacity: 0 } : { x: "110%", opacity: 1 }),
  out: (swap: boolean) => (swap ? { opacity: 0, transition: { duration: 0.14 } } : { x: "110%" }),
};

/** The padding the day keeps on its right for an open panel (home.tsx springs to it on the panel's spring). */
export function dayRoom(layout: PanelLayout, open: boolean, expanded: boolean) {
  if (!open || !layout.wide) return 0;
  // An expanded panel without room beside the day floats over it; the day stays where the usual panel put it.
  return expanded && layout.pushWide ? layout.wideRoom : layout.room;
}

/**
 * A panel that floats at the side, for a class (features/class) or one of the student's own pages (features/student).
 * On a wide screen it slides in from the right (home.tsx moves the day aside on the same spring) and can expand to
 * most of the window; on a phone it covers the screen but for a margin, and a swipe to the right puts it away.
 *
 * open: whether it is shown. hue: a class's colour (data-hue), for the class wash. The children fill it: a header and
 * a scroll of their own.
 */
export function SidePanel({
  open,
  layout,
  expanded = false,
  hue,
  labelledBy,
  onClose,
  children,
  name = "side-panel",
}: {
  open: boolean;
  layout: PanelLayout;
  expanded?: boolean;
  hue?: number;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  /** Kept apart from another panel's presence (the class panel and the student's pages are two). */
  name?: string;
}) {
  const swiped = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 90 || info.velocity.x > 500) onClose();
  };
  const width = expanded ? layout.wideWidth : layout.width;
  // Another panel was up a moment ago (coming in) or is up now (going out): swap in place.
  const active = useContext(ActivePanel);
  const before = useRef(active);
  const swapIn = before.current !== null && before.current !== name;
  const swapOut = active !== null && active !== name;
  useEffect(() => {
    before.current = active;
  });
  return (
    <AnimatePresence custom={swapOut}>
      {open && (
        <motion.aside
          key={name}
          data-class-panel=""
          data-hue={hue}
          data-expanded={expanded || undefined}
          role="dialog"
          aria-modal={!layout.wide || undefined}
          aria-labelledby={labelledBy}
          custom={swapIn}
          variants={slide}
          initial="in"
          animate={{ x: 0, opacity: 1 }}
          exit="out"
          transition={spring.panel}
          drag={layout.wide ? false : "x"}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.7 }}
          onDragEnd={swiped}
          // Beside the day it has a width (springing between the usual and expanded ones in CSS, .neo-panel-sized); on a
          // phone the stylesheet stretches it edge to edge. Not animated by motion, which would hold on to the last width.
          // eslint-disable-next-line glaze/no-inline-style -- the width follows the window, and the day's padding has to match it to the pixel
          style={layout.wide ? { width } : undefined}
          className="neo-panel neo-panel-sized flex touch-pan-y flex-col"
        >
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
