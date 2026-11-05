import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { DayDone, Icon, NoClasses, Pending } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { weekdayOf, isWeekend } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";
import { arrange, keysOf, type Arranged, type DayAssembly, type Lesson, type ReadyDay } from "@/lib/neo/timetable";
import { AssemblyCard, ClassCard, type CardSize } from "./class-card";

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

type LessonCell = { kind: "lesson"; lesson: Lesson; size: CardSize; side: boolean; wide: boolean };
type AssemblyCell = { kind: "assembly"; assembly: DayAssembly };
type Cell = LessonCell | AssemblyCell;

/** Whether an assembly comes before a lesson: one with no time comes first; one at the lesson's own time, before it. */
const before = (a: DayAssembly, l: Lesson) => !a.start || Date.parse(a.start) <= Date.parse(l.start);

/**
 * The block's cells in order: the hero, then the rest of the lessons by time with the day's assemblies among them at
 * their times (never above the hero, the lesson that matters now). Lessons keep their sizes by place, two rows after
 * the hero and then tiles; tiles pair up between one assembly and the next, an odd one out in a run joining the rows
 * rather than stretching across on its own.
 */
function layCells({ hero, rows, tiles }: Arranged, assemblies: DayAssembly[]): Cell[] {
  const queue = [...assemblies];
  const seq: Array<{ lesson: Lesson; size: "row" | "tile" } | AssemblyCell> = [];
  for (const [lesson, size] of [...rows.map(l => [l, "row"] as const), ...tiles.map(l => [l, "tile"] as const)]) {
    while (queue.length && before(queue[0]!, lesson)) seq.push({ kind: "assembly", assembly: queue.shift()! });
    seq.push({ lesson, size });
  }
  seq.push(...queue.map(assembly => ({ kind: "assembly" as const, assembly })));

  const out: Cell[] = hero ? [{ kind: "lesson", lesson: hero, size: "hero", side: false, wide: true }] : [];
  let run: Lesson[] = [];
  const flush = () => {
    const odd = run.length % 2 === 1;
    run.forEach((lesson, i) => {
      if (odd && i === 0) out.push({ kind: "lesson", lesson, size: "row", side: false, wide: true });
      else out.push({ kind: "lesson", lesson, size: "tile", side: (i - (odd ? 1 : 0)) % 2 === 1, wide: false });
    });
    run = [];
  };
  for (const c of seq) {
    if ("lesson" in c && c.size === "tile") {
      run.push(c.lesson);
      continue;
    }
    flush();
    out.push("lesson" in c ? { kind: "lesson", lesson: c.lesson, size: c.size, side: false, wide: true } : c);
  }
  flush();
  return out;
}

/**
 * One school day as a single combined block, biggest first: the lesson on now (or next), the two after it, then the
 * rest two to a row, with any assembly the school's notices announce at its time among them. Today's finished
 * lessons (and assemblies) stay at the foot, greyed out.
 */
function Day({ day, loading, dayKey, now, isToday, zone, selected, onOpen, onNextDay }: Props) {
  const lessons = day?.lessons ?? [];
  // Named by day too, so a card only ever morphs into its own next size, never into another day's card.
  const keys = keysOf(lessons, dayKey);
  const keyOf = new Map<Lesson, string>(lessons.map((l, i) => [l, keys[i]!]));
  const arranged = arrange(lessons, now, isToday);
  const { done, over } = arranged;

  // An assembly over today joins the finished lessons, in time order; the rest sit among the lessons to come.
  const assemblies = day?.assemblies ?? [];
  const isOver = (a: DayAssembly) => isToday && !!a.finish && Date.parse(a.finish) <= now;
  const cells = layCells(arranged, assemblies.filter(a => !isOver(a)));
  const finished: Array<{ at: string; lesson?: Lesson; assembly?: DayAssembly }> = [
    ...done.map(lesson => ({ at: lesson.start, lesson })),
    ...assemblies.filter(isOver).map(assembly => ({ at: assembly.start ?? "", assembly })),
  ].sort((a, b) => a.at.localeCompare(b.at));

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
        {/* Every cell but the first has a hairline above it; the right-hand tile of a pair has one beside it too. */}
        {cells.map((c, i) =>
          c.kind === "lesson" ? (
            <div key={keyOf.get(c.lesson)} data-top={i > 0 || undefined} data-side={c.side || undefined} className={cn("neo-cell", c.wide ? "col-span-2" : "min-w-0")}>
              {card(c.lesson, c.size)}
            </div>
          ) : (
            <div key={`assembly:${c.assembly.id}`} data-top={i > 0 || undefined} className="neo-cell col-span-2">
              <AssemblyCard assembly={c.assembly} zone={zone} />
            </div>
          ),
        )}

        {/* Today's finished classes stay on the day, after the rest, greyed out: no label, nothing to open. */}
        {finished.map((f, i) => (
          <div
            key={f.lesson ? keyOf.get(f.lesson) : `assembly:${f.assembly!.id}`}
            data-top={cells.length + i > 0 || undefined}
            className="neo-cell col-span-2"
          >
            {f.lesson ? card(f.lesson, "done", true) : <AssemblyCard assembly={f.assembly!} zone={zone} done />}
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
