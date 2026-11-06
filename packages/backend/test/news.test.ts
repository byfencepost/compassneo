import { expect, test } from "bun:test";
import { listedIn, newsPush } from "../convex/lib/news";
import type { Doc } from "../convex/_generated/dataModel";

// A WA school (fixed +8): 8am on Friday 6 November.
const now = Date.parse("2026-11-06T08:00:00+08:00");
const MINUTE = 60_000;

const item = (o: Partial<Doc<"announcements">> = {}) =>
  ({
    slug: "examplehs-wa",
    itemId: "n1",
    title: "Daily Notices Friday 6 November",
    postedAt: "2026-11-05T23:30:00.000Z", // 7:30am at the school
    firstSeenAt: now - 20 * MINUTE,
    seenAt: now,
    important: false,
    attachments: [],
    text: "Good morning\n• Year 10 assembly in the gym, period 3\n• Bring your hat",
    hash: "h",
    status: "done",
    parsed: { kind: "daily-notices", summary: "Year 10 assembly in period 3; bring your hat.", bullets: ["Year 10: assembly, P3"], assemblies: [], bells: [] },
    ...o,
  }) as Doc<"announcements">;

test("the day's notices are told with Claude's summary", () => {
  expect(newsPush(item(), now)).toEqual({ kind: "notices", title: "Today's notices", body: "Year 10 assembly in period 3; bring your hat.", url: "/notices" });
});

test("an important announcement is told under its own title", () => {
  const p = newsPush(item({ title: "School closed Monday", important: true, parsed: { kind: "announcement", summary: "No school on Monday.", bullets: [], assemblies: [], bells: [] } }), now);
  expect(p?.title).toBe("School closed Monday");
  expect(p?.body).toBe("No school on Monday.");
});

test("an ordinary announcement is not told", () => {
  expect(newsPush(item({ title: "Book club", parsed: { kind: "announcement", summary: "Book club meets Tuesday.", bullets: [], assemblies: [], bells: [] } }), now)).toBeNull();
});

test("a read is waited on, but not forever", () => {
  const pending = { status: "pending" as const, parsed: undefined };
  expect(newsPush(item({ ...pending, firstSeenAt: now - 5 * MINUTE }), now)).toBeNull();
  const late = newsPush(item({ ...pending, firstSeenAt: now - 16 * MINUTE }), now);
  expect(late?.title).toBe("Daily Notices Friday 6 November");
  expect(late?.body).toBe("Good morning · Year 10 assembly in the gym, period 3 · Bring your hat");
});

test("a read that failed or was skipped is told in the item's own words at once", () => {
  expect(newsPush(item({ status: "failed", parsed: undefined, firstSeenAt: now - MINUTE }), now)?.title).toBe("Daily Notices Friday 6 November");
});

test("only today's news, while it is new", () => {
  expect(newsPush(item({ postedAt: "2026-11-04T23:30:00.000Z" }), now)).toBeNull();
  expect(newsPush(item({ firstSeenAt: now - 4 * 60 * MINUTE }), now)).toBeNull();
});

test("a student's news row lists items in either of its shapes", () => {
  expect(listedIn({ items: [{ id: "n1", at: null }] }, "n1")).toBe(true);
  expect(listedIn([{ id: 7 }], "7")).toBe(true);
  expect(listedIn({ items: [] }, "n1")).toBe(false);
  expect(listedIn(null, "n1")).toBe(false);
});
