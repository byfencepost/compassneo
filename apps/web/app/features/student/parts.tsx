import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Icon, type GlazeIcon } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { spring } from "@/lib/neo/motion";
import { SourceMark, type Source } from "@/components/brand/source-mark";
import { vars, type Mark, type Tone } from "./format";

/**
 * The pieces the student pages are built from, in the class panel's manner: a labelled section over one card of rows
 * split by hairlines, rows that open in place, and sections that fold. Folding is quick (spring.fold, 180ms).
 */

const slug = (s: string) => s.toLowerCase().replace(/\W+/g, "-");

/** A section's name: its glyph in the page's colour, the name, the source's logo when it says where this came from. */
export function SectionHead({ id, icon, title, source, aside }: { id: string; icon: GlazeIcon; title: string; source?: Source; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-(--control-sm) items-center gap-1.5 ps-1">
      <Icon icon={icon} size={16} className="neo-glyph" />
      <h3 id={id} className="type-label text-text-1">
        {title}
      </h3>
      {source && <SourceMark source={source} size={13} className="ms-0.5" />}
      {aside && <div className="ms-auto flex min-w-0 items-center">{aside}</div>}
    </div>
  );
}

export const sectionId = (title: string) => `st-${slug(title)}`;

/** A labelled card: the name above it, outside, then the rows. */
export function Section({
  icon,
  title,
  source,
  aside,
  children,
  className,
}: {
  icon: GlazeIcon;
  title: string;
  source?: Source;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = sectionId(title);
  return (
    <section aria-labelledby={id}>
      <SectionHead id={id} icon={icon} title={title} source={source} aside={aside} />
      <div className={cn("neo-stack neo-notice", className)}>{children}</div>
    </section>
  );
}

/**
 * A section that folds away under its name (a long list that matters less than what is above it). Its rows sit in a
 * card, or (bare) the children bring their own.
 */
export function FoldSection({
  icon,
  title,
  count,
  defaultOpen = false,
  bare,
  children,
}: {
  icon: GlazeIcon;
  title: string;
  count?: ReactNode;
  defaultOpen?: boolean;
  bare?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = sectionId(title);
  return (
    <section aria-labelledby={id}>
      <h3 className="mb-2">
        {/* eslint-disable-next-line glaze/no-native-control -- a section's name that folds it: a Glaze Button would draw a pill round the heading */}
        <button
          type="button"
          id={id}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(o => !o)}
          className="neo-st-fold flex min-h-(--control-sm) w-full items-center gap-1.5 ps-1 pe-1.5 text-start"
        >
          <Icon icon={icon} size={16} className="neo-glyph" />
          <span className="type-label text-text-1">{title}</span>
          {count != null && <span className="neo-tabular type-label-sm text-text-3">{count}</span>}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.fold} className="ms-auto inline-grid text-text-3">
            <Icon icon={ChevronDown} size={16} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-body`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.fold}
            className="overflow-hidden"
          >
            {bare ? children : <div className="neo-stack neo-notice">{children}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** A row in a card, under a hairline (but the first). */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-t border-line-faint px-3.5 py-2.5 first:border-t-0", className)}>{children}</div>;
}

/**
 * A row that grows in place to say more. Closed, it is a title and a one-line preview; opened, the preview gives way
 * to the whole of it (more), in the same spot, on the fold (180ms), and nothing above it moves. Without more it is a
 * plain row with nothing to press.
 */
export function GrowRow({
  lead,
  title,
  preview,
  more,
  aside,
  dim,
  onPick,
  on,
}: {
  lead: ReactNode;
  title: ReactNode;
  preview?: ReactNode;
  more?: ReactNode;
  aside?: ReactNode;
  dim?: boolean;
  /** Instead of growing, the row picks its thing to show beside the list (a maximised page); on: it is the one shown. */
  onPick?: () => void;
  on?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (onPick)
    return (
      <div className="border-t border-line-faint first:border-t-0">
        {/* eslint-disable-next-line glaze/no-native-control -- a whole list row that shows its thing beside the list: a Glaze Button would draw a pill inside the card */}
        <button type="button" aria-pressed={!!on} data-on={on || undefined} onClick={onPick} className="neo-st-row flex w-full items-start gap-3 px-3.5 py-2.5 text-start">
          {lead}
          <div className="min-w-0 flex-1">
            <p className={cn("truncate type-label", dim ? "text-text-2" : "text-text-1")}>{title}</p>
            {preview && <p className={cn("neo-tabular truncate type-caption", dim ? "text-text-3" : "text-text-2")}>{preview}</p>}
          </div>
          {aside}
        </button>
      </div>
    );
  const body = (
    <>
      {lead}
      <div className="min-w-0 flex-1">
        <p className={cn("type-label", dim ? "text-text-2" : "text-text-1", !open && "truncate")}>{title}</p>
        <AnimatePresence initial={false}>
          {!open && preview && (
            <motion.p
              key="preview"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.fold}
              className={cn("neo-tabular truncate type-caption", dim ? "text-text-3" : "text-text-2")}
            >
              {preview}
            </motion.p>
          )}
          {open && (
            <motion.div key="more" id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.fold} className="overflow-hidden">
              {more}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {aside}
    </>
  );
  if (!more) return <Row className="flex items-start gap-3">{body}</Row>;
  return (
    <div className="border-t border-line-faint first:border-t-0">
      {/* eslint-disable-next-line glaze/no-native-control -- a whole list row that grows to say more: a Glaze Button would draw a pill inside the card */}
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)} className="neo-st-row flex w-full items-start gap-3 px-3.5 py-2.5 text-start">
        {body}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.fold} className="mt-0.5 inline-grid shrink-0 text-text-3">
          <Icon icon={ChevronDown} size={16} />
        </motion.span>
      </button>
    </div>
  );
}

/** The last row of a card, which folds more rows out under itself ("Other classes and activities"). */
export function FoldMore({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="border-t border-line-faint">
        {/* eslint-disable-next-line glaze/no-native-control -- a list row that folds out more rows: a Glaze Button would draw a pill inside the card */}
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)} className="neo-st-row flex w-full items-center gap-2 px-3.5 py-2.5 text-start">
          <span className="min-w-0 flex-1 truncate type-label-sm text-text-2">{label}</span>
          <span className="neo-tabular shrink-0 type-label-sm text-text-3">{count}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.fold} className="inline-grid shrink-0 text-text-3">
            <Icon icon={ChevronDown} size={16} />
          </motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.fold} className="overflow-hidden">
            <div className="border-t border-line-faint">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** A card that says why there is nothing, or what there is instead: a glyph, a line, a sentence, maybe an action. */
export function Notice({ icon, title, body, action }: { icon: GlazeIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="neo-stack neo-notice flex items-center gap-3.5 px-4 py-3.5">
      <Icon icon={icon} size={24} className="neo-glyph" />
      <div className="min-w-0 flex-1">
        <p className="type-label text-text-1">{title}</p>
        {body && <p className="mt-0.5 type-body-sm text-text-2">{body}</p>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

const R = 42;
const C = 2 * Math.PI * R;

/** A share as a ring in its status colour, lit from above, drawn round from twelve o'clock as it arrives. */
export function Ring({ percent, tone, label, thickness = 11, className }: { percent: number; tone: Tone; label?: string; thickness?: number; className?: string }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-tone={tone} className={cn("neo-st-ring relative inline-grid shrink-0", className)}>
      <svg viewBox="0 0 100 100" className="size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="neo-st-ring-hi" />
            <stop offset="1" className="neo-st-ring-lo" />
          </linearGradient>
          <linearGradient id={`${gid}t`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="neo-st-track-hi" />
            <stop offset="1" className="neo-st-track-lo" />
          </linearGradient>
        </defs>
        <circle cx={50} cy={50} r={R} fill="none" strokeWidth={thickness} stroke={`url(#${gid}t)`} />
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
      </svg>
    </span>
  );
}

/**
 * A stacked bar: each part's share in its mark's colour (a class's own colour for "class"). scale shortens the whole
 * bar against its neighbours (a term still under way). It grows in from the left once.
 */
export function Bar({ parts, scale = 1, className }: { parts: Array<{ value: number; mark: Mark }>; scale?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("neo-st-bar", className)}>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={spring.morph}
        style={vars({ "--w": `${Math.max(0, Math.min(1, scale)) * 100}%` })}
        className="flex h-full w-(--w) origin-left gap-px"
      >
        {parts
          .filter(p => p.value > 0)
          .map((p, i) => (
            <span key={i} data-mark={p.mark} style={vars({ "--g": p.value })} className="neo-st-mark neo-st-seg" />
          ))}
      </motion.div>
    </div>
  );
}

/** A section on its way: its label and a card of bars as tall as the rows coming. */
export function SkeletonSection({ rows }: { rows: number[] }) {
  return (
    <div aria-hidden>
      <div className="mb-2 flex min-h-(--control-sm) items-center gap-1.5 px-1">
        <span className="neo-st-skel size-4 rounded-pill" />
        <span className="neo-st-skel h-3.5 w-20" />
      </div>
      <div className="neo-stack neo-notice flex flex-col gap-3 p-4">
        {rows.map((h, i) => (
          <span key={i} style={vars({ "--h": `${h}px` })} className="neo-st-skel h-(--h) w-full" />
        ))}
      </div>
    </div>
  );
}
