import { slugRegion } from "@compassneo/compass";

/**
 * School days. Compass schools keep Australian time, so a day is the school's calendar day, written YYYY-MM-DD.
 *
 * Bucketing uses the state's standard offset, without daylight saving: lessons run between 8am and 4pm, so an hour
 * either way never moves one across midnight. Clients format times in the school's IANA zone (schoolZone).
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const OFFSET_HOURS: Record<string, number> = { wa: 8, sa: 9.5, nt: 9.5 };
const ZONES: Record<string, string> = {
  wa: "Australia/Perth",
  sa: "Australia/Adelaide",
  nt: "Australia/Darwin",
  qld: "Australia/Brisbane",
  nsw: "Australia/Sydney",
  act: "Australia/Sydney",
  vic: "Australia/Melbourne",
  tas: "Australia/Hobart",
};

const offsetMs = (slug: string) => (OFFSET_HOURS[slugRegion(slug) ?? ""] ?? 10) * 60 * MINUTE;

export const schoolZone = (slug: string) => ZONES[slugRegion(slug) ?? ""] ?? "Australia/Melbourne";

/** The school day an instant falls on. */
export const dayOf = (at: string | number | Date, slug: string) => new Date(new Date(at).getTime() + offsetMs(slug)).toISOString().slice(0, 10);

/** Today at the school. */
export const schoolToday = (slug: string) => dayOf(Date.now(), slug);

/** A day some days from another. */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Every day from one to another, both included. */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
