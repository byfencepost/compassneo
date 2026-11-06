import { useState } from "react";
import { motion } from "motion/react";
import { EventAssembly, Icon, Relief, RoomChange } from "@/components/glaze/icon";
import { subjectIcon } from "@/lib/neo/subjects";
import { cn } from "@/lib/glaze/utils";
import { clock, minutes } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";
import { whenOf, type DayAssembly, type Lesson } from "@/lib/neo/timetable";
import { assemblyTime } from "@/lib/neo/announcements";
import { Donut } from "./donut";

/** hero: on now or next. row: the two after. tile: the rest, two to a row. done: over today, one slim line. */
export type CardSize = "hero" | "row" | "tile" | "done";

/**
 * The names a lesson's parts carry while they morph, so a card that changes size as the day goes on (next, then on
 * now, then over) glides each part from where it was to where it is going: the name, the room, the teacher, the
 * time, the grade.
 */
export const ids = (k: string) => ({
  card: `card:${k}`,
  name: `name:${k}`,
  room: `room:${k}`,
  who: `who:${k}`,
  time: `time:${k}`,
  donut: `donut:${k}`,
  glyph: `glyph:${k}`,
});

/** The radius each size of card is drawn with (motion keeps it true while a card changes size). */
/** Cells in the day's block are square (the block rounds the corners); an opened class is a card of its own. */
export const RADIUS: Record<CardSize | "focus", number> = { hero: 0, row: 0, tile: 0, done: 0, focus: 14 };

/** A class's room, in the class's colour. A room that changed today carries the swap glyph. */
export function RoomTag({ lesson, size, layoutId }: { lesson: Lesson; size: "lg" | "md" | "sm"; layoutId?: string }) {
  if (!lesson.room) return null;
  return (
    <motion.span
      layoutId={layoutId}
      transition={spring.morph}
      data-hue={lesson.hue}
      data-size={size}
      className="neo-room"
      title={lesson.roomWas ? `Moved from ${lesson.roomWas}` : undefined}
    >
      {lesson.roomWas && <Icon icon={RoomChange} size={12} weight="bold" label="Room changed" />}
      {lesson.room}
    </motion.span>
  );
}

type Person = NonNullable<Lesson["teacher"]>;

const initials = (p: Person) => {
  const w = (p.full ?? p.name).replace(/\./g, " ").split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w.length > 1 ? (w[w.length - 1]?.[0] ?? "") : "")).toUpperCase();
};

/**
 * A teacher's face: their Compass photo once a sync has copied it, else their initials on grey.
 *
 * The initials are always there, hidden under a photo: the face's text is what a line of name and time aligns its
 * baseline to, and a photo alone has none (its baseline would be its bottom edge), so swapping one in used to move the
 * line. The photo lies over them, so a face with a photo sits exactly where one without does. A photo that fails to
 * load leaves the initials.
 */
export function TeacherFace({ person, className, textClassName }: { person: Person; className?: string; textClassName?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = person.photoUrl && failed !== person.photoUrl ? person.photoUrl : null;
  return (
    <span aria-hidden className={cn("neo-face relative grid shrink-0 place-items-center overflow-hidden rounded-pill", className)}>
      <span className={cn("font-semibold", textClassName, photo && "invisible")}>{initials(person)}</span>
      {photo && (
        <img
          src={photo}
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
          loading="lazy"
          onError={() => setFailed(photo)}
        />
      )}
    </span>
  );
}

/** The kind of subject, as a glyph before the class's name. */
export function SubjectGlyph({ lesson, size, layoutId, className }: { lesson: Lesson; size: 12 | 14 | 16 | 20 | 24; layoutId?: string; className?: string }) {
  return (
    <motion.span layoutId={layoutId} transition={spring.morph} className={cn("neo-glyph inline-grid shrink-0 place-items-center", className)}>
      <Icon icon={subjectIcon(lesson.subject, lesson.name, lesson.code)} size={size} />
    </motion.span>
  );
}

/** Who takes the class, with their face. A relief carries the swap glyph after the name. */
export function TeacherName({
  lesson,
  className,
  layoutId,
  face = "sm",
  compact,
}: {
  lesson: Lesson;
  className?: string;
  layoutId?: string;
  face?: "sm" | "md" | false;
  /** On a phone, the face alone stands for the teacher; the name shows from the sm breakpoint. */
  compact?: boolean;
}) {
  if (!lesson.teacher) return null;
  const relief = !!lesson.teacherWas;
  return (
    <motion.span
      layoutId={layoutId}
      transition={spring.morph}
      className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap", className)}
    >
      {face && <TeacherFace person={lesson.teacher} className={face === "md" ? "size-5" : "size-4"} textClassName="neo-face-text" />}
      <span className={cn("truncate", compact && face && "max-sm:sr-only")}>{lesson.teacher.name}</span>
      {relief && <Icon icon={Relief} size={12} weight="bold" label={`Relief for ${lesson.teacherWas?.name ?? "the usual teacher"}`} />}
    </motion.span>
  );
}

export const timeRange = (l: Lesson, zone: string) => `${clock(l.start, zone)} – ${clock(l.finish, zone)}`;

/** Within this of a lesson's start or end, an assembly counts as at its start or end (bells round to the minute). */
const EDGE = 5 * 60 * 1000;

/**
 * What an assembly does to a lesson, in words: "Assembly instead", "Assembly 9:00 – 9:40, then class", "Class, then
 * assembly 2:10 – 2:40". One the notice is vague about, or that may be for other students, starts "Maybe".
 */
export function assemblyText(l: Lesson, zone: string): string | null {
  const a = l.assembly;
  if (!a) return null;
  const what = a.maybe ? "Maybe an assembly" : "Assembly";
  if (a.replaces === "whole") return `${what} instead`;
  const range = a.start && a.finish ? `${clock(a.start, zone)} – ${clock(a.finish, zone)}` : a.start ? `at ${clock(a.start, zone)}` : null;
  if (!range) return what;
  const start = Date.parse(a.start!);
  if (start <= Date.parse(l.start) + EDGE) return `${what} ${range}, then class`;
  if (a.finish && Date.parse(a.finish) >= Date.parse(l.finish) - EDGE) return `Class, then ${what.toLowerCase()} ${range}`;
  return `${what} ${range}`;
}

/**
 * The mark an assembly leaves on a lesson's card, in the spirit of the relief and room marks: the assembly glyph and
 * what happens to the class. compact: on a phone the glyph alone stands for it (the words stay for screen readers);
 * glyph: only ever the glyph (a finished lesson's slim line).
 */
export function AssemblyNote({ lesson, zone, compact, glyph, className }: { lesson: Lesson; zone: string; compact?: boolean; glyph?: boolean; className?: string }) {
  const text = assemblyText(lesson, zone);
  if (!text) return null;
  const place = lesson.assembly?.place;
  return (
    <span className={cn("neo-assembly-note inline-flex min-w-0 items-center gap-1 whitespace-nowrap", className)}>
      <Icon icon={EventAssembly} size={12} label={glyph ? text : undefined} />
      {!glyph && <span className={cn("truncate", compact && "max-sm:sr-only")}>{place && !compact ? `${text} · ${place}` : text}</span>}
    </span>
  );
}

/**
 * An assembly as a cell in the day's block, at its time among the lessons: its name, who it is for, where, and when.
 * Nothing to open; the lessons it takes carry their own mark (AssemblyNote). done: over today, one slim line.
 */
export function AssemblyCard({ assembly: a, zone, done }: { assembly: DayAssembly; zone: string; done?: boolean }) {
  const about = [a.audience, a.maybe ? "May not include you" : null, a.notes].filter(Boolean).join(" · ");
  return (
    <div data-done={done || undefined} className={cn("neo-card neo-assembly", done ? "px-4 py-2" : "px-4 py-2.5")}>
      <span className={cn("flex min-w-0 items-center", done ? "gap-2" : "min-h-8 gap-2.5")}>
        <Icon icon={EventAssembly} size={done ? 14 : 16} className="neo-assembly-glyph" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate", done ? "type-label" : "neo-assembly-name", a.maybe && !done && "text-text-2")}>{a.title}</span>
          {!done && about && <span className="truncate type-caption text-text-3">{about}</span>}
        </span>
        {a.place && (
          <span className="neo-room" data-size={done ? "sm" : "md"}>
            {a.place}
          </span>
        )}
        <span className="neo-tabular shrink-0 type-caption whitespace-nowrap text-text-3">{assemblyTime(a, zone)}</span>
      </span>
    </div>
  );
}

/** The line over the biggest card: how long is left of the lesson on now, or when the next one starts. */
function heroStatus(l: Lesson, now: number, isToday: boolean, zone: string) {
  if (!isToday) return l.period != null ? `Period ${l.period}` : null;
  const w = whenOf(l, now);
  if (w === "now") return `Now · ${minutes(Date.parse(l.finish) - now)} left`;
  const until = Date.parse(l.start) - now;
  return until < 90 * 60 * 1000 ? `Next · in ${minutes(until)}` : `Next · at ${clock(l.start, zone)}`;
}

/**
 * A lesson as a card, in one of four sizes: the hero (on now or next), a row, a tile, a finished one. Pressing it opens
 * the class in the panel at the side (features/class); while it is open, every card of that class is marked as
 * picked (selected: washed and ringed in its colour). Without onOpen (a guest's day, features/guest) it opens
 * nothing, so it is not a button at all.
 */
export function ClassCard({
  lesson,
  k,
  size,
  now,
  isToday,
  zone,
  done,
  selected,
  onOpen,
}: {
  lesson: Lesson;
  k: string;
  size: CardSize;
  now: number;
  isToday: boolean;
  zone: string;
  done?: boolean;
  selected?: boolean;
  onOpen?: (k: string, el: HTMLElement) => void;
}) {
  const id = ids(k);
  const pct = lesson.grade?.percent;
  const hasGrade = pct != null;
  const live = isToday && whenOf(lesson, now) === "now";
  const progress = live ? (now - Date.parse(lesson.start)) / (Date.parse(lesson.finish) - Date.parse(lesson.start)) : 0;
  const status = size === "hero" ? heroStatus(lesson, now, isToday, zone) : null;
  const look = cn(
    "neo-card w-full",

    size === "hero" && "px-5 pt-4.5 pb-5.5",
    size === "row" && "px-4 py-2.5",
    size === "tile" && "px-4 py-2.5",
    size === "done" && "px-4 py-2",
  );

  const body = (
    <>
      {size === "hero" && (
        <span className="flex min-h-17 items-center gap-4">
          <span className="flex min-w-0 flex-1 flex-col">
            {status && (
              <motion.span layout="position" transition={spring.morph} className="mb-1 type-label-sm text-text-2">
                {status}
              </motion.span>
            )}
            <span className="flex min-w-0 items-center gap-2">
              <SubjectGlyph lesson={lesson} size={24} layoutId={id.glyph} />
              <motion.span layoutId={id.name} transition={spring.morph} className="neo-class-hero min-w-0 truncate">
                {lesson.name}
              </motion.span>
              <RoomTag lesson={lesson} size="lg" layoutId={id.room} />
            </span>
            <span className="mt-2 flex min-w-0 items-baseline gap-3">
              <TeacherName lesson={lesson} layoutId={id.who} face="md" className="neo-teacher-hero shrink-3" />
              <motion.span
                layoutId={id.time}
                transition={spring.morph}
                className="neo-time-hero whitespace-nowrap text-text-3"
                title={lesson.timesWas ? `Compass has ${timeRange({ ...lesson, ...lesson.timesWas }, zone)}` : undefined}
              >
                {timeRange(lesson, zone)}
              </motion.span>
            </span>
            {lesson.assembly ? (
              <AssemblyNote lesson={lesson} zone={zone} className="mt-2 type-label-sm" />
            ) : (
              lesson.timesWas && <span className="neo-assembly-note mt-2 type-label-sm">New times from the school's notices</span>
            )}
          </span>
          {hasGrade && <Donut percent={pct} showValue layoutId={id.donut} thickness={9} className="size-17" valueClassName="neo-value-hero" />}
        </span>
      )}

      {size === "row" && (
        <span className="flex min-h-8 items-center gap-2.5">
          <SubjectGlyph lesson={lesson} size={16} layoutId={id.glyph} />
          <motion.span layoutId={id.name} transition={spring.morph} className="neo-class-row min-w-0 truncate">
            {lesson.name}
          </motion.span>
          <RoomTag lesson={lesson} size="md" layoutId={id.room} />
          <AssemblyNote lesson={lesson} zone={zone} compact className="shrink-2 type-caption" />
          <TeacherName lesson={lesson} layoutId={id.who} compact className="shrink-3 type-label text-text-1" />
          <motion.span layoutId={id.time} transition={spring.morph} className="neo-tabular ms-auto shrink-0 type-caption whitespace-nowrap text-text-3">
            {timeRange(lesson, zone)}
          </motion.span>
          {hasGrade && <Donut percent={pct} showValue layoutId={id.donut} thickness={12} className="size-8" valueClassName="neo-value-row" />}
        </span>
      )}

      {size === "tile" && (
        <span className="flex min-h-10 items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <SubjectGlyph lesson={lesson} size={14} layoutId={id.glyph} />
              <motion.span layoutId={id.name} transition={spring.morph} className="neo-class-tile min-w-0 truncate">
                {lesson.name}
              </motion.span>
              <RoomTag lesson={lesson} size="sm" layoutId={id.room} />
            </span>
            <span className="flex min-w-0 items-baseline gap-2">
              <motion.span layoutId={id.time} transition={spring.morph} className="neo-tabular type-caption whitespace-nowrap text-text-3">
                {timeRange(lesson, zone)}
              </motion.span>
              {lesson.assembly ? (
                <AssemblyNote lesson={lesson} zone={zone} className="type-caption" />
              ) : (
                lesson.teacherWas && <TeacherName lesson={lesson} layoutId={id.who} face={false} className="type-caption" />
              )}
            </span>
          </span>
          {hasGrade && <Donut percent={pct} layoutId={id.donut} thickness={16} className="size-5" />}
        </span>
      )}

      {size === "done" && (
        <span className="flex min-w-0 items-center gap-2">
          <SubjectGlyph lesson={lesson} size={14} layoutId={id.glyph} />
          <motion.span layoutId={id.name} transition={spring.morph} className="min-w-0 truncate type-label">
            {lesson.name}
          </motion.span>
          <RoomTag lesson={lesson} size="sm" layoutId={id.room} />
          <AssemblyNote lesson={lesson} zone={zone} glyph />
          <motion.span layoutId={id.time} transition={spring.morph} className="neo-tabular ms-auto type-caption whitespace-nowrap text-text-3">
            {timeRange(lesson, zone)}
          </motion.span>
        </span>
      )}

      {live && (
        <span className="neo-progress" aria-hidden>
          <motion.span
            className="block"
            initial={false}
            animate={{ scaleX: Math.max(0.02, Math.min(1, progress)) }}
            transition={{ duration: 15, ease: "linear" }}
          />
        </span>
      )}
    </>
  );

  if (!onOpen)
    return (
      <motion.div
        layoutId={id.card}
        transition={spring.morph}
        data-hue={lesson.hue}
        data-current={live || undefined}
        data-done={done || undefined}
        // eslint-disable-next-line glaze/no-inline-style -- motion keeps a corner radius true while a box morphs only when it is set through style
        style={{ borderRadius: RADIUS[size] }}
        className={look}
      >
        {body}
      </motion.div>
    );

  return (
    <motion.button
      type="button"
      layoutId={id.card}
      transition={spring.morph}
      data-hue={lesson.hue}
      data-current={live || undefined}
      data-done={done || undefined}
      data-selected={selected || undefined}
      aria-pressed={selected ?? false}
      onClick={e => onOpen(k, e.currentTarget)}
      // eslint-disable-next-line glaze/no-inline-style -- motion keeps a corner radius true while a box morphs only when it is set through style
      style={{ borderRadius: RADIUS[size] }}
      className={look}
    >
      {body}
    </motion.button>
  );
}
