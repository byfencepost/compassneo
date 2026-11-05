import { useId, type SVGProps } from "react";
import { cn } from "@/lib/glaze/utils";
import { COMPASS_LETTERS, MARK, MARK_VIEWBOX, NEO_IN_WORDMARK, NEO_LETTERS, NEO_VIEWBOX, WORDMARK_VIEWBOX } from "./paths";

type SvgProps = Omit<SVGProps<SVGSVGElement>, "children">;

/** Names the logo for assistive tech, or hides it when the name is written beside it. */
function a11y(label?: string) {
  return label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
}

/**
 * The mark: a glass dial in Neo blue with a red north needle. The needle is its own group, so it can swing to north
 * (needle="find"), turn once (needle="turn"), or point at a heading and swing to each new one (heading, in degrees
 * clockwise from north; keep it growing to keep the needle turning clockwise). brand.css holds the motion.
 */
export function NeoMark({
  size = 52,
  label,
  needle,
  heading,
  needleClassName,
  className,
  ...props
}: SvgProps & { size?: number; label?: string; needle?: "find" | "turn"; heading?: number; needleClassName?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox={MARK_VIEWBOX} width={size} height={size} fill="none" className={cn("shrink-0", className)} {...a11y(label)} {...props}>
      <defs>
        <linearGradient id={`${id}d`} x1="7.616" y1="7.616" x2="44.384" y2="44.384" gradientUnits="userSpaceOnUse">
          <stop className="neo-dial-stop" stopOpacity="0.95" />
          <stop className="neo-dial-stop" offset="1" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="7.616" y1="7.616" x2="44.384" y2="44.384" gradientUnits="userSpaceOnUse">
          <stop className="neo-glint-stop" stopOpacity="0.6" />
          <stop className="neo-glint-stop" offset="0.493" stopOpacity="0" />
          <stop className="neo-glint-stop" offset="0.997" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="19.5408" y1="25.4765" x2="32.4811" y2="38.4163" gradientUnits="userSpaceOnUse">
          <stop className="neo-glint-stop" stopOpacity="0.8" />
          <stop className="neo-glint-stop" offset="0.519" stopOpacity="0.5" />
          <stop className="neo-glint-stop" offset="1" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={`${id}n`} x1="19.5374" y1="13.6024" x2="32.4776" y2="26.5422" gradientUnits="userSpaceOnUse">
          <stop className="neo-needle-stop" stopOpacity="0.95" />
          <stop className="neo-needle-stop" offset="1" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path d={MARK.dial} fill={`url(#${id}d)`} />
      <path d={MARK.rim} fill={`url(#${id}r)`} />
      <g
        className={cn("neo-needle", needle === "find" && "neo-needle-find", needle === "turn" && "neo-needle-turn", heading != null && "neo-needle-follow", needleClassName)}
        style={heading != null ? { rotate: `${heading}deg` } : undefined}
      >
        <path d={MARK.south} fill={`url(#${id}s)`} />
        <path d={MARK.north} fill={`url(#${id}n)`} />
      </g>
    </svg>
  );
}

/** "compass" in the current text colour and "neo" in Neo blue, so it reads on both themes. Height sets the size. */
export function Wordmark({ label, className, ...props }: SvgProps & { label?: string }) {
  return (
    <svg viewBox={WORDMARK_VIEWBOX} fill="none" className={cn("shrink-0", className)} {...a11y(label)} {...props}>
      <g className="fill-current">
        {COMPASS_LETTERS.map(d => <path key={d.slice(0, 16)} d={d} />)}
      </g>
      <g className="fill-neo">
        {NEO_IN_WORDMARK.map(d => <path key={d.slice(0, 16)} d={d} />)}
      </g>
    </svg>
  );
}

/** "neo" alone, in Neo blue: a compact lockup beside the mark. */
export function NeoWord({ label, className, ...props }: SvgProps & { label?: string }) {
  return (
    <svg viewBox={NEO_VIEWBOX} fill="none" className={cn("shrink-0 fill-neo", className)} {...a11y(label)} {...props}>
      {NEO_LETTERS.map(d => <path key={d.slice(0, 16)} d={d} />)}
    </svg>
  );
}

// The bezel: 72 bearings, every fifth degree, the cardinal and 30° ones longer, and a small red north.
const C = 100;
function ticks(every: number, skip: number, r1: number, r2: number) {
  let d = "";
  for (let deg = 0; deg < 360; deg += every) {
    if (skip && deg % skip === 0) continue;
    const a = ((deg - 90) * Math.PI) / 180;
    const x1 = C + r1 * Math.cos(a), y1 = C + r1 * Math.sin(a);
    const x2 = C + r2 * Math.cos(a), y2 = C + r2 * Math.sin(a);
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}
const MINOR = ticks(5, 30, 92, 96);
const MAJOR = ticks(30, 0, 89, 96);

/**
 * A compass bezel drawn in hairlines, for behind the mark. Decorative. `ticks` draws only the bearings: laid over the
 * bezel in Neo blue and masked to an arc, it is the sync gauge (brand.css, .neo-bezel-lit).
 */
export function Bezel({ className, ticks: ticksOnly, ...props }: SvgProps & { ticks?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden className={cn("neo-bezel", className)} {...props}>
      {!ticksOnly && <circle cx={C} cy={C} r={98} className="stroke-current" strokeWidth={0.3} />}
      {!ticksOnly && <circle cx={C} cy={C} r={72} className="stroke-current" strokeWidth={0.3} />}
      <path d={MINOR} className="stroke-current" strokeWidth={ticksOnly ? 0.6 : 0.35} strokeLinecap="round" />
      <path d={MAJOR} className={cn("stroke-current", !ticksOnly && "neo-bezel-major")} strokeWidth={ticksOnly ? 0.8 : 0.5} strokeLinecap="round" />
      {!ticksOnly && <path d="M100 1.6 L102.6 7 L97.4 7 Z" className="neo-bezel-north" />}
    </svg>
  );
}
