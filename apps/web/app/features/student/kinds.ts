import {
  EventActivity,
  EventAssembly,
  EventClub,
  EventExam,
  EventExcursion,
  EventGeneric,
  EventMeeting,
  EventWorkshop,
  Today,
  type GlazeIcon,
} from "@/components/glaze/icon";
import type { SchoolEvent } from "@/lib/neo/student";

/**
 * What kind of thing an event is. Compass files most things as "event" or "activity", so the title says better
 * (an assembly, a club, a workshop), and a place off the school grounds makes it an excursion.
 */
export type EventKind = SchoolEvent["kind"] | "excursion" | "workshop";

/** Each kind's name and glyph (an excursion is the bus). */
export const KIND: Record<EventKind, { label: string; icon: GlazeIcon }> = {
  event: { label: "Event", icon: EventGeneric },
  excursion: { label: "Excursion", icon: EventExcursion },
  workshop: { label: "Workshop", icon: EventWorkshop },
  meeting: { label: "Meeting", icon: EventMeeting },
  assembly: { label: "Assembly", icon: EventAssembly },
  activity: { label: "Activity", icon: EventActivity },
  calendar: { label: "School calendar", icon: Today },
  exam: { label: "Exam", icon: EventExam },
  club: { label: "Club", icon: EventClub },
};

/** A place that is not a room or a field at school: a university, an arena, a jetty, a street address. */
const OFF_SITE = /universit|arena|jetty|terrace|street|\bst\b|centre|center|museum|\bpark\b|beach|perth|campus|\bzoo\b|stadium/i;

/** Runs often enough to be a club rather than an event. */
export const isClub = (e: Pick<SchoolEvent, "kind" | "title" | "sessions">) => e.kind === "club" || /\bclub\b/i.test(e.title) || e.sessions.length >= 3;

export function kindOf(e: Pick<SchoolEvent, "kind" | "title" | "place" | "sessions">): EventKind {
  const t = e.title;
  if (/\bexams?\b|\btests?\b/i.test(t)) return "exam";
  if (/assembly/i.test(t)) return "assembly";
  if (isClub(e)) return "club";
  if (/excursion|cruise|\bcamp\b|\btour\b|\btrip\b/i.test(t)) return "excursion";
  if (/workshop|seminar|masterclass/i.test(t)) return "workshop";
  const place = e.place ?? e.sessions.find(s => s.place)?.place ?? "";
  if ((e.kind === "event" || e.kind === "activity") && OFF_SITE.test(place)) return "excursion";
  return e.kind;
}

/** A title reduced to its words, so Chronicle's "Event" field finds the calendar's event. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
