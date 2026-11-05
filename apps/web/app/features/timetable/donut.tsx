import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/glaze/utils";
import { spring } from "@/lib/neo/motion";

/** A grade's colour: green from 80, Neo blue from 65, amber from 50, coral under. */
export const toneOf = (percent: number) => (percent >= 80 ? "ok" : percent >= 65 ? "neo" : percent >= 50 ? "warn" : "fail");

const R = 42;
const C = 2 * Math.PI * R;

/**
 * A grade as a ring: the arc is the mark out of 100, in the grade's colour, drawn round from twelve o'clock as it
 * arrives. Size comes from className; the stroke is in the ring's own units, so a small ring can carry a thicker one.
 */
export function Donut({
  percent,
  thickness = 10,
  showValue,
  letter,
  layoutId,
  className,
  valueClassName,
}: {
  percent: number;
  thickness?: number;
  /** The number in the middle. */
  showValue?: boolean;
  /** Connect's letter grade, under the number. */
  letter?: string | null;
  layoutId?: string;
  className?: string;
  valueClassName?: string;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const p = Math.max(0, Math.min(100, percent));
  const shown = Number.isInteger(p) ? p : Math.round(p);
  return (
    <motion.div
      layoutId={layoutId}
      transition={spring.morph}
      role="img"
      aria-label={`${shown}%${letter ? `, grade ${letter}` : ""}`}
      data-tone={toneOf(p)}
      className={cn("neo-donut relative grid shrink-0 place-items-center", className)}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          {/* Lit from above: the arc lighter at the top, its own colour at the foot; the track darker at the top, as if
              pressed in. */}
          <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="neo-donut-arc-hi" />
            <stop offset="1" className="neo-donut-arc-lo" />
          </linearGradient>
          <linearGradient id={`${gid}t`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="neo-donut-track-hi" />
            <stop offset="1" className="neo-donut-track-lo" />
          </linearGradient>
        </defs>
        <circle cx={50} cy={50} r={R} fill="none" strokeWidth={thickness} stroke={`url(#${gid}t)`} />
        <g>
          <motion.circle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={C}
            transform="rotate(-90 50 50)"
            stroke={`url(#${gid}a)`}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - p / 100) }}
            transition={{ type: "spring", visualDuration: 0.9, bounce: 0.12, delay: 0.08 }}
          />
        </g>
      </svg>
      {showValue && (
        <span aria-hidden className="relative flex flex-col items-center">
          <span className={cn("neo-donut-value text-text-1", valueClassName)}>{shown}</span>
          {letter && <span className="mt-0.5 type-label-sm text-text-2">{letter}</span>}
        </span>
      )}
    </motion.div>
  );
}
