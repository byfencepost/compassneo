import { expect, test } from "bun:test";
import { briefMoment, changesLine, someMorning } from "../convex/lib/brief";
import type { StoredLesson } from "../convex/timetable";

// A WA school (fixed +8, no daylight saving), so the instants below read plainly in local time.
const at = (hm: string) => Date.parse(`2026-11-06T${hm}:00+08:00`);
const lesson = (hm: string, code: string, o: Partial<StoredLesson> = {}): StoredLesson => ({
  id: `${code}-${hm}`,
  code,
  subject: null,
  start: new Date(at(hm)).toISOString(),
  finish: new Date(at(hm) + 50 * 60_000).toISOString(),
  period: null,
  room: "404",
  coverRoom: null,
  teacher: "rwims",
  cover: null,
  isClass: true,
  allDay: false,
  ...o,
});

const day = [
  lesson("08:45", "10HR", { subject: "Homeroom" }),
  lesson("09:00", "10MA1", { subject: "Year 10 Mathematics", cover: "jlee" }),
  lesson("10:00", "10EN1", { subject: "English", coverRoom: "12" }),
];

test("the brief's phases run from T-75 to the first class, homeroom included", () => {
  expect(briefMoment(day, at("07:29")).phase).toBe("off");
  expect(briefMoment(day, at("07:30")).phase).toBe("ask");
  expect(briefMoment(day, at("07:39")).phase).toBe("ask");
  expect(briefMoment(day, at("07:42")).phase).toBe("early");
  const m = briefMoment(day, at("07:45"));
  expect(m.phase).toBe("tell");
  expect(m.phase !== "off" && m.changed.map(l => l.code)).toEqual(["10MA1", "10EN1"]);
  expect(briefMoment(day, at("08:44")).phase).toBe("tell");
  expect(briefMoment(day, at("08:45")).phase).toBe("off");
});

test("a day without classes has no brief", () => {
  expect(briefMoment([], at("07:45")).phase).toBe("off");
  expect(briefMoment([lesson("08:00", "Athletics carnival", { isClass: false }), lesson("00:00", "10MA1", { allDay: true })], at("07:00")).phase).toBe("off");
});

test("changes are said as the app names classes and teachers, a double period once", () => {
  const who = (code: string | null) => (code ? { code, name: `${code[0]!.toUpperCase()}. ${code[1]!.toUpperCase()}${code.slice(2)}`, full: null } : null);
  const changed = [...day.slice(1), lesson("09:50", "10MA1", { subject: "Year 10 Mathematics", cover: "jlee" })];
  expect(changesLine(changed, who)).toBe("Maths: J. Lee instead of R. Wims · English: Room 12 (was 404)");
  expect(changesLine([lesson("11:00", "10SC1", { subject: "Science", cover: "jlee", teacher: null, coverRoom: "L2", room: null })], who)).toBe(
    "Science: J. Lee covering, room L2",
  );
});

test("it is morning somewhere in Australia only part of the UTC day", () => {
  expect(someMorning(Date.parse("2026-11-05T21:00:00Z"))).toBe(true); // 8am in Sydney, 5am in Perth
  expect(someMorning(Date.parse("2026-11-06T03:30:00Z"))).toBe(true); // 11:30am in Perth
  expect(someMorning(Date.parse("2026-11-06T09:00:00Z"))).toBe(false); // evening everywhere
});
