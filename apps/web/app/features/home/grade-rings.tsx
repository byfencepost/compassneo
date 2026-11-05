import type { CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, Icon } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { pct } from "@/lib/neo/classes";
import { subjectIcon } from "@/lib/neo/subjects";
import type { GradeTrend, OverviewSubject } from "@/lib/neo/overview";
import { Donut } from "@/features/timetable/donut";

/**
 * The main subjects' grades as rings, in one row, centred (the row on home, which is a button itself, so these are only
 * a picture inside it): each takes an equal share of the width, its ring as big as that allows (up to 48px). Each is in
 * its class's colour (the colour it has on the timetable), the ring, the glyph in the middle and the score under it
 * alike, so a subject reads the same everywhere. A subject with nothing marked yet has an empty dashed ring and a dash.
 * With more, a last ring says how many subjects are left out ("+5", "more"), dashed like a ring with nothing in it.
 */
export function GradeRings({ subjects, more = 0, className }: { subjects: OverviewSubject[]; more?: number; className?: string }) {
  return (
    <span
      // eslint-disable-next-line glaze/no-inline-style -- as many equal columns as there are rings, so they keep to one row
      style={{ "--rings": subjects.length + (more > 0 ? 1 : 0) } as CSSProperties}
      className={cn("neo-rings w-full", className)}
    >
      {subjects.map(s => (
        <span key={s.key} data-hue={s.hue ?? undefined} className="flex min-w-0 justify-center">
          <span className="flex w-full max-w-16 min-w-0 flex-col items-center gap-1 py-1.5">
            <span className="sr-only">{label(s)}. </span>
            <Ring s={s} />
          </span>
        </span>
      ))}
      {more > 0 && (
        <span className="flex min-w-0 justify-center">
          <span className="flex w-full max-w-16 min-w-0 flex-col items-center gap-1 py-1.5">
            <span className="sr-only">And {more} more {more === 1 ? "subject" : "subjects"}.</span>
            <span aria-hidden className="relative grid aspect-square w-full max-w-12 place-items-center">
              <span className="neo-ring-empty" />
              <span className="neo-tabular relative type-caption font-semibold text-text-2">+{more}</span>
            </span>
            <span aria-hidden className="type-caption font-semibold text-text-3">more</span>
          </span>
        </span>
      )}
    </span>
  );
}

const label = (s: OverviewSubject) => `${s.name}: ${s.percent != null ? `${pct(s.percent)}%${s.letter ? `, ${s.letter}` : ""}` : "nothing marked yet"}`;

function Ring({ s }: { s: OverviewSubject }) {
  return (
    <>
      <span aria-hidden className="relative grid aspect-square w-full max-w-12 place-items-center">
        {s.percent != null ? <Donut percent={s.percent} thickness={9} className="absolute inset-0 size-full" /> : <span className="neo-ring-empty" />}
        <span className="relative inline-grid">
          <Icon icon={subjectIcon(s.subject, s.name, s.code ?? "")} size={16} className="neo-glyph" />
        </span>
      </span>
      <span aria-hidden className={cn("neo-tabular max-w-full truncate text-center type-caption font-semibold", s.percent != null ? "neo-glyph" : "text-text-3")}>
        {s.percent != null ? `${pct(s.percent)}%` : "–"}
      </span>
    </>
  );
}

const DAY = 86400 * 1000;

/** How a grade moved, as an arrow and the points: green up, amber down. Said in full to a screen reader. */
export function TrendMark({ trend, now, className }: { trend: GradeTrend; now: number; className?: string }) {
  const up = trend.change > 0;
  const days = Math.max(1, Math.round((now - trend.since) / DAY));
  const points = pct(Math.abs(trend.change));
  return (
    <span className={cn("neo-tabular inline-flex shrink-0 items-center gap-0.5 type-label-sm", up ? "text-ok-text" : "text-warn-text", className)}>
      <Icon icon={up ? ArrowUpRight : ArrowDownRight} size={14} />
      <span aria-hidden>{points}</span>
      <span className="sr-only">
        {up ? "Up" : "Down"} {points} {points === "1" ? "point" : "points"} in {days === 1 ? "a day" : `${days} days`}
      </span>
    </span>
  );
}
