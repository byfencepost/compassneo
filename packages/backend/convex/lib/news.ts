import type { Doc } from "../_generated/dataModel";
import type { Push } from "../push";
import { dayOf } from "./days";
import { postedOf } from "./assemblies";

/**
 * Which of the school's news items are told to the students who see them (convex/announcements.ts), and in what
 * words. Two kinds are: the day's notices (a bulletin Claude read as "daily-notices", or one titled like one when it was
 * not read), and anything the school marked important. Only today's news, and only while it is new: an item is told
 * only if it was posted today at the school and first seen there in the last TELL_WITHIN, so an outage, or a feed
 * that changes shape, never brings the backlog in a burst.
 *
 * An item is told once it has been read (the summary is what the notification says), or as soon as it is known it will
 * not be (no API key, nothing to read, a failed read), or READ_WAIT after it was first seen however its read is going:
 * then in its own words.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** Told only while this new to the school (first seen by any sync there). */
export const TELL_WITHIN = 3 * HOUR;
/** A read is waited on this long from when the item was first seen; then the item is told without it. */
export const READ_WAIT = 15 * MINUTE;
/**
 * A student whose news row was made after (or within this of) an item being first seen at the school had the item
 * come with their first sync: it is the backlog to them, and not told.
 */
export const NEW_ROW_SLACK = MINUTE;

/** How a bulletin is titled, for one Claude has not read: "Daily Notices", "Student Bulletin", "Today's Announcements". */
const DAILY = /\b(daily|student|today'?s|morning)\s+(notices?|bulletin|announcements?)\b/i;

export const newsKey = (itemId: string) => `news:${itemId}`;

const line = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** The first few lines of an item's words, bullets and all, on one line. */
function opening(text: string) {
  const lines = text
    .split("\n")
    .map(l => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
  return line(lines.slice(0, 3).join(" · "), 220);
}

/** What a student is told about an item now, or null when it is not news to tell (or not yet). */
export function newsPush(n: Doc<"announcements">, now: number): Push | null {
  if (dayOf(postedOf(n), n.slug) !== dayOf(now, n.slug)) return null;
  if (now - n.firstSeenAt > TELL_WITHIN) return null;
  const p = n.parsed ?? null;
  const daily = p ? p.kind === "daily-notices" : DAILY.test(n.title);
  if (!daily && !n.important) return null;
  if (n.status === "pending" && now - n.firstSeenAt < READ_WAIT) return null;

  const title = line(n.title, 120) || "New notice";
  const fallback = opening(n.text) || (n.attachments.length ? `Attached: ${n.attachments.join(", ")}` : n.by ? `From ${n.by}` : "Posted on Compass.");
  if (p && daily) return { kind: "notices", title: "Today's notices", body: p.summary || p.bullets.slice(0, 3).join(" · ") || title, url: "/notices" };
  if (p) return { kind: "notices", title, body: p.summary || p.bullets[0] || fallback, url: "/notices" };
  // Not read (yet, or ever): the item in its own words.
  return { kind: "notices", title, body: fallback, url: "/notices" };
}

/** Whether a student's news row (compassCache "news") lists an item. Older rows were a bare list. */
export function listedIn(data: unknown, itemId: string) {
  const items = (Array.isArray(data) ? data : ((data as { items?: unknown[] } | null)?.items ?? [])) as Array<{ id?: unknown } | null>;
  return items.some(i => i != null && i.id != null && String(i.id) === itemId);
}
