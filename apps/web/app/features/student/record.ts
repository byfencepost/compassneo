import type { Chronicle, ChronicleEntry } from "@/lib/neo/student";
import { norm } from "./kinds";

/**
 * Reading Chronicle entries for what they are: house points and commendations to celebrate, the events the student
 * went to (named by the event, not "Event Participation"), and attendance notices, which only need counting.
 */

/** "1.2. Attitude/Behaviour" reads as "Attitude/Behaviour". */
export const cleanCategory = (c: string | null) => c?.replace(/^\d+(\.\d+)*\.?\s+/, "").trim() || null;

/** The category, unless it only says the title again ("House Points & Positive Behaviour" on "House Points for Positive Behaviour"). */
export function categoryOf(e: ChronicleEntry) {
  const c = cleanCategory(e.category);
  if (!c) return null;
  const title = new Set(norm(e.title).split(" "));
  const words = norm(c).split(" ").filter(w => w.length > 2);
  return words.length && words.every(w => title.has(w)) ? null : c;
}

const field = (e: ChronicleEntry, name: RegExp) => e.fields.find(f => name.test(f.name))?.value.trim() || null;

/** An attendance notification or a letter home about an absence. */
export const isNotice = (e: ChronicleEntry) =>
  /attendance/i.test(e.category ?? "") || /not present|unexplained|unaccounted|absent|truan/i.test(e.title);

export const isCommendation = (e: ChronicleEntry) => /commendation/i.test(e.title);

/** "Attendance Notification - Student Not Present in one or more classes" reads as "Not present in one or more classes". */
export const noticeName = (e: ChronicleEntry) => {
  const t = e.title
    .replace(/^attendance notification\s*-\s*/i, "")
    .replace(/^student\s+/i, "")
    .replace(/['‘’]/g, "")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

const clock = (h: string, m: string) => `${Number(h)}:${m}`;
const sessionDate = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * An event the student went to: the event's name, where, and the session as Compass writes it
 * ("Tue, 22/09 - 05:45 PM > 09:45 PM + 7 session(s)") made readable ("5:45 – 9:45 pm", and 7 more).
 */
export function eventOf(e: ChronicleEntry) {
  const name = field(e, /^event$/i);
  if (!name && !/event participation/i.test(e.category ?? e.title)) return null;
  const place = field(e, /location/i);
  const raw = field(e, /session/i) ?? "";
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)\s*>\s*(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(raw);
  const a = m ? `${clock(m[1]!, m[2]!)}${m[3]!.toLowerCase() === m[6]!.toLowerCase() ? "" : ` ${m[3]!.toLowerCase()}`}` : null;
  const time = m ? `${a} – ${clock(m[4]!, m[5]!)} ${m[6]!.toLowerCase()}` : null;
  const more = Number(/\+\s*(\d+)\s*session/i.exec(raw)?.[1] ?? 0);
  // "Tue, 22/09" with the year the entry was made: "Tue 22 Sept".
  const d = /(\d{1,2})\/(\d{1,2})/.exec(raw);
  const year = e.at?.slice(0, 4);
  const date = d && year ? sessionDate.format(Date.parse(`${year}-${d[2]!.padStart(2, "0")}-${d[1]!.padStart(2, "0")}T12:00:00Z`)).replace(",", "") : null;
  return {
    name: name ?? "An event",
    place: place && !/^unassigned$/i.test(place) ? place : null,
    date,
    time,
    /** Sessions the student went to, this one included. */
    sessions: 1 + more,
  };
}

const isNote = (f: { name: string; value: string }) => /detail|comment|note|reason|description|behaviour/i.test(f.name) || f.value.length > 48;

/** The staff member's own words, when an entry has them (the longest note-like field). */
export function noteOf(e: ChronicleEntry) {
  const notes = e.fields.filter(f => f.value.trim() && isNote(f));
  return notes.sort((a, b) => b.value.length - a.value.length)[0]?.value.trim() ?? null;
}

/** The short answers to Compass's template ("Respect", "in the classroom"), without its prompts, shortest first. */
export function valuesOf(e: ChronicleEntry) {
  const note = noteOf(e);
  return e.fields
    .map(f => f.value.trim().replace(/\.$/, ""))
    .filter(v => v && v !== note?.replace(/\.$/, "") && v.length <= 48)
    .sort((a, b) => a.length - b.length);
}

/** The events Chronicle says the student went to, by name, with how many sessions. */
export function attended(data: Chronicle | null | undefined) {
  const went = new Map<string, number>();
  for (const e of data?.entries ?? []) {
    const ev = eventOf(e);
    if (ev && ev.name !== "An event") went.set(norm(ev.name), Math.max(went.get(norm(ev.name)) ?? 0, ev.sessions));
  }
  return went;
}
