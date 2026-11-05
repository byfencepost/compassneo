import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { DayDone, Icon, NoClasses, Pending } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { weekdayOf, isWeekend } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";
import { arrange, keysOf, type Lesson, type ReadyDay } from "@/lib/neo/timetable";
import { ClassCard, type CardSize } from "./class-card";

/** The day block's corners: rounded, not a pill and not square. */
export const BLOCK_RADIUS = 12;

type Props = {
  day: ReadyDay | null;
  loading: boolean;
  dayKey: string;
  now: number;
  isToday: boolean;
  zone: string;
  dir: number;
  /** The class open in the panel, by code: its cards are marked. */
  selected: string | null;
  onOpen: (k: string, el: HTMLElement) => void;
  onNextDay: () => void;
};

/**
 * The day's classes. Turning to another day moves the whole day at once: the old one slides a little the way you went
 * and fades, the new one comes in from the other side, and the space they sit in springs to the new day's height, so
 * nothing below jumps.
 */
export function DayView(props: Props) {
  const { dayKey, dir } = props;
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setHeight(e!.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    // The clip that hides the sliding days has room around the block for its shadow and focus rings, given back with
    // negative margins, so the block sits exactly where it would without it.
    <motion.div initial={false} animate={{ height }} transition={spring.morph} className="-mx-4 -mt-2 -mb-8 overflow-hidden px-4">
      <div ref={inner} className="relative">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={dayKey}
            custom={dir}
            variants={slide}
            initial="from"
            animate="at"
            exit="gone"
            transition={spring.morph}
            className="pt-2 pb-8"
          >
            <Day {...props} />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

const slide = {
  from: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  at: { opacity: 1, x: 0 },
  gone: (dir: number) => ({ opacity: 0, x: dir * -48, transition: spring.focus }),
};

/**
 * One school day as a single combined block, biggest first: the lesson on now (or next), the two after it, then the
 * rest two to a row. Today's finished lessons stay at the foot, greyed out.
 */
function Day({ day, loading, dayKey, now, isToday, zone, selected, onOpen, onNextDay }: Props) {
  const lessons = day?.lessons ?? [];
  // Named by day too, so a card only ever morphs into its own next size, never into another day's card.
  const keys = keysOf(lessons, dayKey);
  const keyOf = new Map<Lesson, string>(lessons.map((l, i) => [l, keys[i]!]));
  const arranged = arrange(lessons, now, isToday);
  const { hero, done, over } = arranged;
  // Tiles come in pairs: an odd one out joins the rows rather than stretching across on its own.
  const odd = arranged.tiles.length % 2 === 1;
  const rows = odd ? [...arranged.rows, arranged.tiles[0]!] : arranged.rows;
  const tiles = odd ? arranged.tiles.slice(1) : arranged.tiles;

  // Where each cell sits, for its hairlines: every cell but the first has one above it, and the right-hand tile of a
  // pair has one beside it.
  const cells: Array<{ lesson: Lesson; size: CardSize; side: boolean; wide: boolean }> = [];
  if (hero) cells.push({ lesson: hero, size: "hero", side: false, wide: true });
  rows.forEach(l => cells.push({ lesson: l, size: "row", side: false, wide: true }));
  tiles.forEach((l, i) => cells.push({ lesson: l, size: "tile", side: i % 2 === 1, wide: false }));

  const card = (l: Lesson, size: CardSize, isDone = false) => {
    const k = keyOf.get(l)!;
    return <ClassCard lesson={l} k={k} size={size} now={now} isToday={isToday} zone={zone} done={isDone} selected={selected === l.code} onOpen={onOpen} />;
  };

  if (!day) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-16 type-body-sm text-text-2">
        {loading && <Icon icon={Pending} size={16} className="animate-spin text-neo-text motion-reduce:animate-none" />}
        Getting this day from Compass
      </p>
    );
  }

  if (lessons.length === 0) {
    return (
      <Notice
        icon={NoClasses}
        title={isWeekend(dayKey) ? `No classes, it's ${weekdayOf(dayKey)}` : "No classes on this day"}
        body={isWeekend(dayKey) ? "Enjoy the weekend." : "Compass has nothing on your timetable: a holiday, a pupil-free day, or exams."}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {over && (
        <Notice
          icon={DayDone}
          title="That's today's classes done"
          body="Tomorrow's timetable is a tap away."
          action={
            <Button size="sm" variant="secondary" onClick={onNextDay}>
              See tomorrow
            </Button>
          }
        />
      )}
      <div
        // eslint-disable-next-line glaze/no-inline-style -- the block's corners, which motion needs as a style while the cells inside it morph
        style={{ borderRadius: BLOCK_RADIUS }}
        className="neo-stack grid grid-cols-2"
      >
        {cells.map((c, i) => (
          <div key={keyOf.get(c.lesson)} data-top={i > 0 || undefined} data-side={c.side || undefined} className={cn("neo-cell", c.wide ? "col-span-2" : "min-w-0")}>
            {card(c.lesson, c.size)}
          </div>
        ))}

        {/* Today's finished classes stay on the day, after the rest, greyed out: no label, nothing to open. */}
        {done.map((l, i) => (
          <div key={keyOf.get(l)} data-top={cells.length + i > 0 || undefined} className="neo-cell col-span-2">
            {card(l, "done", true)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Notice({ icon, title, body, action }: { icon: Parameters<typeof Icon>[0]["icon"]; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="neo-stack neo-notice flex items-center gap-3 px-4 py-3.5">
      <Icon icon={icon} size={24} weight="light" className="text-neo-text" />
      <div className="min-w-0 flex-1">
        <p className="type-label text-text-1">{title}</p>
        <p className="mt-0.5 type-body-sm text-text-2">{body}</p>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
