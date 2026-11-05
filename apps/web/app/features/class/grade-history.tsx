import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Icon } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { dayIn, dayName, shortDate } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";
import { pct, runningGrade, type SemesterGrade } from "@/lib/neo/classes";
import { toneOf } from "@/features/timetable/donut";

/** A grade's colour as text, on Glaze's status roles (and Neo blue between "good" and "getting there"). */
export const toneText = (p: number) =>
  ({ ok: "text-ok-text", neo: "text-neo-text", warn: "text-warn-text", fail: "text-fail-text" })[toneOf(p)];

/** Up, down or level, against another figure: an arrow and the points between them. */
export function Trend({ from, to, against, className }: { from: number; to: number; against: string; className?: string }) {
  const d = Math.round((to - from) * 10) / 10;
  if (d === 0) return <span className={cn("type-label-sm text-text-2", className)}>Level with {against}</span>;
  const up = d > 0;
  return (
    <span className={cn("inline-flex items-center gap-1 type-label-sm", up ? "text-ok-text" : "text-warn-text", className)}>
      <Icon icon={up ? ArrowUpRight : ArrowDownRight} size={14} />
      {pct(Math.abs(d))} {Math.abs(d) === 1 ? "point" : "points"} {up ? "up" : "down"} on {against}
    </span>
  );
}

/**
 * The grade as it built up, task by task: the line is the subject's score after each marked task (in the outline's
 * order), the hollow rings each task's own mark. The bands at 50, 65 and 80 are where a grade's colour changes.
 * Pointing at the chart shows the task under the pointer. The numbers under it match the assessments list.
 */
export function GradeChart({ grade, tall }: { grade: SemesterGrade; /** Taller, across a maximised page. */ tall?: boolean }) {
  const steps = runningGrade(grade.tasks);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const plot = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<number | null>(null);
  if (!steps.length) return null;

  const values = steps.flatMap(s => [s.grade, s.own ?? s.grade]);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 6) / 10) * 10);
  const hi = 100;
  const n = steps.length;
  // Percent of the plot's width and height, with room at the ends for the dots.
  const xAt = (i: number) => (n === 1 ? 50 : 5 + (90 * i) / (n - 1));
  const yAt = (v: number) => 100 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  const line = steps.map((s, i) => `${i ? "L" : "M"}${xAt(i).toFixed(2)} ${yAt(s.grade).toFixed(2)}`).join(" ");
  const area = `${line} L${xAt(n - 1).toFixed(2)} 100 L${xAt(0).toFixed(2)} 100 Z`;
  const bands = [50, 65, 80].filter(v => v > lo && v < hi);

  const first = steps[0]!;
  const last = steps[n - 1]!;
  const summary =
    n === 1
      ? `One task marked so far: ${first.task.name}, ${pct(first.grade)}%.`
      : `Your grade went from ${pct(first.grade)}% after ${first.task.name} to ${pct(last.grade)}% after ${last.task.name}, over ${n} marked tasks.`;

  const point = (e: React.PointerEvent) => {
    const r = plot.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 100;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
    setOn(best);
  };
  const shown = on != null ? steps[on]! : null;
  // The tip sits above its point, unless the point is near the top of the chart: there it would leave the chart (and
  // be cut off by the panel), so it hangs below instead.
  const tipHigh = shown ? Math.min(yAt(shown.grade), yAt(shown.own ?? shown.grade)) : 0;
  const tipLow = shown ? Math.max(yAt(shown.grade), yAt(shown.own ?? shown.grade)) : 0;
  const tipBelow = tipHigh < 45;

  return (
    <figure className="m-0">
      <p className="sr-only">{summary}</p>
      <div aria-hidden className="relative ps-1 pe-7">
        <div ref={plot} className={cn("relative touch-pan-y", tall ? "h-52" : "h-36")} onPointerMove={point} onPointerDown={point} onPointerLeave={() => setOn(null)}>
          {/* The bands' values, at the right-hand edge. */}
          {[...bands, hi].map(v => (
            <span
              key={v}
              // eslint-disable-next-line glaze/no-inline-style -- a label placed at its value on the chart's scale
              style={{ top: `${yAt(v)}%` }}
              className="neo-tabular absolute -end-7 -translate-y-1/2 type-caption text-text-3"
            >
              {v}
            </span>
          ))}
          <motion.div
            className="absolute inset-0"
            initial={{ clipPath: "inset(-12px 100% -12px -12px)" }}
            animate={{ clipPath: "inset(-12px -12px -12px -12px)" }}
            transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" className="neo-chart-area-hi" />
                  <stop offset="1" className="neo-chart-area-lo" />
                </linearGradient>
              </defs>
              {[...bands, hi].map(v => (
                <line key={v} x1={0} x2={100} y1={yAt(v)} y2={yAt(v)} className="neo-chart-grid" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              ))}
              {n > 1 && <path d={area} fill={`url(#${gid}a)`} />}
              {n > 1 && (
                <path d={line} fill="none" className="neo-chart-line" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            {steps.map((s, i) =>
              s.own != null && Math.abs(s.own - s.grade) > 0.5 ? (
                <span
                  key={`own-${s.index}`}
                  className="neo-chart-own"
                  // eslint-disable-next-line glaze/no-inline-style -- a mark placed at its value on the chart's scale
                  style={{ left: `${xAt(i)}%`, top: `${yAt(s.own)}%` }}
                />
              ) : null,
            )}
            {steps.map((s, i) => (
              <span
                key={s.index}
                data-on={on === i || undefined}
                className="neo-chart-dot"
                // eslint-disable-next-line glaze/no-inline-style -- a point placed at its value on the chart's scale
                style={{ left: `${xAt(i)}%`, top: `${yAt(s.grade)}%` }}
              />
            ))}
          </motion.div>

          {shown && on != null && (
            <>
              <span
                className="neo-chart-guide absolute inset-y-0 w-px"
                // eslint-disable-next-line glaze/no-inline-style -- the guide follows the point under the pointer
                style={{ left: `${xAt(on)}%` }}
              />
              <motion.div
                key={on}
                initial={{ opacity: 0, y: tipBelow ? -4 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.snap}
                className={cn("neo-chart-tip absolute z-10 px-2.5 py-1.5", !tipBelow && "-translate-y-full")}
                // eslint-disable-next-line glaze/no-inline-style -- the tip sits by its point, kept inside the chart
                style={{
                  left: `clamp(0px, calc(${xAt(on)}% - 5rem), calc(100% - 10rem))`,
                  top: tipBelow ? `calc(${tipLow}% + 12px)` : `calc(${tipHigh}% - 10px)`,
                }}
              >
                <p className="max-w-40 truncate type-label-sm text-text-1">
                  {shown.index + 1}. {shown.task.name}
                </p>
                <p className="neo-tabular type-caption text-text-2">
                  {shown.task.mark}/{shown.task.max}
                  {shown.own != null && ` · ${pct(shown.own)}%`} · grade {pct(shown.grade)}%
                </p>
              </motion.div>
            </>
          )}
        </div>
        {n <= 16 && (
          <div className="relative mt-1.5 h-4">
            {steps.map((s, i) => (
              <span
                key={s.index}
                // eslint-disable-next-line glaze/no-inline-style -- each task's number under its point
                style={{ left: `${xAt(i)}%` }}
                className={cn("neo-tabular absolute -translate-x-1/2 type-caption", on === i ? "text-text-1" : "text-text-3")}
              >
                {s.index + 1}
              </span>
            ))}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-text-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="neo-swatch neo-part-earned" />
          Your grade after each task
        </span>
        {steps.some(s => s.own != null && Math.abs(s.own - s.grade) > 0.5) && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="neo-chart-own static m-0" />
            That task's own mark
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Semester 1 beside semester 2: each one's grade as a bar, and how far this one moved on the last. */
export function Semesters({ current, other }: { current: SemesterGrade; other: SemesterGrade }) {
  const both = [current, other].sort((a, b) => a.semester - b.semester);
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {both.map((g, i) => (
          <li key={g.semester} className="flex items-center gap-3">
            <span className="w-22 shrink-0 type-label-sm text-text-2">Semester {g.semester}</span>
            <div className="neo-meter flex-1">
              <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: (g.percent ?? 0) / 100 }} transition={{ ...spring.morph, delay: 0.2 + i * 0.08 }} />
            </div>
            <span className={cn("neo-tabular w-18 shrink-0 text-end type-label", g.percent != null ? toneText(g.percent) : "text-text-3")}>
              {g.percent != null ? `${pct(g.percent)}%` : "No marks"}
              {g.letter && <span className="text-text-2"> {g.letter}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Change = { at: number; from: number | null; to: number | null; tasks: SemesterGrade["tasks"] };

/** Each time a sync saw the grade move or a mark arrive, newest first. Marks there before history began have no day. */
function changesOf(g: SemesterGrade): Change[] {
  const times = new Set<number>();
  for (const p of g.points) if (!p.baseline) times.add(p.at);
  for (const t of g.tasks) if (t.markedAt) times.add(t.markedAt);
  return [...times]
    .sort((a, b) => b - a)
    .map(at => {
      const i = g.points.findIndex(p => p.at === at);
      return {
        at,
        from: i > 0 ? (g.points[i - 1]!.percent ?? null) : null,
        to: i >= 0 ? (g.points[i]!.percent ?? null) : null,
        tasks: g.tasks.filter(t => t.markedAt === at),
      };
    });
}

/** The grade's history as a log: the day, what was marked, and where the grade went. */
export function GradeChanges({ grade, since, zone, today }: { grade: SemesterGrade; since: number | null; zone: string; today: string }) {
  const changes = changesOf(grade);
  const began = since ? shortDate(dayIn(zone, since)) : null;
  if (!changes.length) {
    return (
      <p className="type-body-sm text-text-2">
        {began
          ? `Compass Neo has kept track of this grade since ${began}. New marks will show up here with the day they came in.`
          : "Compass Neo starts keeping this grade's history at the next sync. New marks will show up here with the day they came in."}
      </p>
    );
  }
  return (
    <div>
      <ol className="flex flex-col">
        {changes.map(c => (
          <li key={c.at} className="flex gap-3 border-t border-line-faint py-2.5 first:border-t-0 first:pt-0">
            <span className="w-20 shrink-0 type-label-sm text-text-2">{dayName(dayIn(zone, c.at), today)}</span>
            <div className="min-w-0 flex-1">
              {c.tasks.length > 0 ? (
                c.tasks.map(t => (
                  <p key={t.id} className="type-body-sm text-text-1">
                    {t.name}{" "}
                    <span className="neo-tabular text-text-2">
                      {t.was != null ? `changed from ${t.was} to ${t.mark}/${t.max}` : `marked ${t.mark}/${t.max}`}
                    </span>
                  </p>
                ))
              ) : (
                <p className="type-body-sm text-text-1">Connect updated the outline</p>
              )}
              {c.to != null && (
                <p className="neo-tabular mt-0.5 type-caption text-text-2">
                  {c.from != null ? `Grade ${pct(c.from)}% to ` : "Grade now "}
                  <span className={toneText(c.to)}>{pct(c.to)}%</span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {began && <p className="mt-2 type-caption text-text-3">Kept since {began}; marks from before then have no day.</p>}
    </div>
  );
}
