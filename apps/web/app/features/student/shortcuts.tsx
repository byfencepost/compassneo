import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Grade, HousePoints, Icon, type GlazeIcon } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { dayIn, dayName, zoneOf } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";
import { useSession } from "@/lib/neo/session";
import { useAttendance, useChronicle, useEvents, type EventSession, type SchoolEvent } from "@/lib/neo/student";
import { useNow } from "@/lib/neo/time";
import { chronicleCounts, recordOf } from "./chronicle";
import { attendanceTone, pctText, plural, toneText } from "./format";
import { PAGES, pageHue, type StudentPage } from "./meta";
import { Ring } from "./parts";

/**
 * The way into the student's own pages from home, under the day: one block of three, split by hairlines, each with
 * its glyph in its page's colour and the one thing worth knowing: the year's attendance on a small ring, the next
 * event (or that there is none), the latest Chronicle entry (or what Compass counts but hides). The page open in the
 * panel is pressed in, with a bar in its colour along the foot that glides to the next one opened.
 */
export function StudentShortcuts({ token, open, onOpen }: { token: string; open: StudentPage | null; onOpen: (page: StudentPage) => void }) {
  const me = useSession().me;
  const zone = zoneOf(me?.slug ?? "");
  const now = useNow(60_000);
  const today = dayIn(zone, now);
  const attendance = useAttendance(token).data;
  const events = useEvents(token).data;
  const chronicle = useChronicle(token).data;

  // Attendance: the year's share of rolls present.
  const percent = attendance?.compass?.overall.percent ?? null;
  const tone = percent != null ? attendanceTone(percent) : null;
  const attendanceTile: Shown =
    attendance === undefined
      ? "loading"
      : percent != null && tone
        ? {
            value: (
              <>
                <Ring percent={percent} tone={tone} thickness={16} className="size-3.5" />
                <span className={cn("neo-st-value truncate", toneText[tone])}>{pctText(percent)}%</span>
              </>
            ),
            caption: "this year",
          }
        : { value: <Quiet>Not synced</Quiet>, caption: "" };

  // Events: the soonest still to come.
  const next = (events?.events ?? [])
    .map(e => ({ e, s: e.sessions.find(s => Date.parse(s.finish) >= now) }))
    .filter((x): x is { e: SchoolEvent; s: EventSession } => !!x.s)
    .sort((a, b) => a.s.start.localeCompare(b.s.start))[0];
  const eventsTile: Shown =
    events === undefined
      ? "loading"
      : !events
        ? { value: <Quiet>Not synced</Quiet>, caption: "" }
        : next
          ? { value: <span className="neo-st-value truncate text-text-1">{next.e.title}</span>, caption: dayName(dayIn(zone, next.s.start), today) }
          : { value: <Quiet>Nothing on</Quiet>, caption: events.events.length ? `${events.events.length} this year` : "" };

  // Chronicle: the record (house points, else commendations), the latest entry, or what Compass counts but hides.
  const counts = chronicle ? chronicleCounts(chronicle) : null;
  // The year's, as the page leads with; a quiet year shows the record so far.
  const year = today.slice(0, 4);
  const thisYear = chronicle?.entries.filter(e => e.at && dayIn(zone, e.at).startsWith(year)) ?? [];
  const record = chronicle ? recordOf(thisYear.length ? thisYear : chronicle.entries) : null;
  const latest = chronicle?.entries[0];
  const chronicleTile: Shown =
    chronicle === undefined
      ? "loading"
      : !chronicle || !counts || !record
        ? { value: <Quiet>Not synced</Quiet>, caption: "" }
        : record.points > 0
          ? { value: <Figure icon={HousePoints} hue={4} n={record.points} />, caption: record.points === 1 ? "house point" : "house points" }
          : record.commendations > 0
            ? { value: <Figure icon={Grade} hue={2} n={record.commendations} />, caption: record.commendations === 1 ? "commendation" : "commendations" }
            : latest
              ? { value: <span className="neo-st-value truncate text-text-1">{latest.title}</span>, caption: latest.at ? dayName(dayIn(zone, latest.at), today) : "" }
              : counts.hidden
                ? { value: <span className="neo-st-value truncate text-text-1">{plural(counts.hidden, "entry", "entries")}</span>, caption: "not shown to you" }
                : { value: <Quiet>No entries</Quiet>, caption: "" };

  return (
    <section aria-label="Your year" className="mt-5">
      <div className="neo-stack neo-notice grid grid-cols-3">
        <Tile page="attendance" hue={pageHue("attendance", percent)} on={open === "attendance"} shown={attendanceTile} onOpen={onOpen} />
        <Tile page="events" hue={pageHue("events", null)} on={open === "events"} shown={eventsTile} onOpen={onOpen} />
        <Tile page="chronicle" hue={pageHue("chronicle", null)} on={open === "chronicle"} shown={chronicleTile} onOpen={onOpen} />
      </div>
    </section>
  );
}

type Shown = "loading" | { value: ReactNode; caption: string };

/** A count in its colour, beside its glyph. */
function Figure({ icon, hue, n }: { icon: GlazeIcon; hue: number; n: number }) {
  return (
    <span data-hue={hue} className="flex min-w-0 items-center gap-1">
      <Icon icon={icon} size={14} className="neo-glyph" />
      <span className="neo-st-value neo-glyph truncate">{n}</span>
    </span>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <span className="neo-st-value truncate text-text-2">{children}</span>;
}

function Tile({ page, hue, on, shown, onOpen }: { page: StudentPage; hue: number; on: boolean; shown: Shown; onOpen: (page: StudentPage) => void }) {
  const p = PAGES[page];
  const loading = shown === "loading";
  return (
    // eslint-disable-next-line glaze/no-native-control -- a tile inside the block, edge to edge: a Glaze Button would draw a pill inside it
    <button
      type="button"
      aria-pressed={on}
      aria-busy={loading || undefined}
      onClick={() => onOpen(page)}
      data-hue={hue}
      data-on={on || undefined}
      className="neo-st-tile relative flex min-w-0 flex-col items-stretch px-3 pt-2.5 pb-3 text-start"
    >
      {on && <motion.span layoutId="neo-st-tile-on" aria-hidden className="neo-st-tile-on absolute inset-0" transition={spring.morph} />}
      <span className="relative flex min-w-0 items-center gap-1.5">
        <Icon icon={p.icon} size={16} className="neo-glyph" />
        <span className="truncate type-label-sm text-text-2">{p.title}</span>
      </span>
      <span className="relative mt-1.5 flex h-5 min-w-0 items-center gap-1.5">{loading ? <span className="neo-st-skel h-3.5 w-14" /> : shown.value}</span>
      <span className="relative mt-0.5 h-4 truncate type-caption text-text-3">{loading ? "" : shown.caption}</span>
    </button>
  );
}
