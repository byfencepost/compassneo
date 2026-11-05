import { Avatar } from "@/components/glaze/ui/avatar";
import { Linked } from "@/features/class/sections";
import { Calm, Check, Icon } from "@/components/glaze/icon";
import { dayIn, daysApart } from "@/lib/neo/days";
import { ago } from "@/lib/neo/time";
import type { Chronicle, EventSession, Events, SchoolEvent } from "@/lib/neo/student";
import { pattern, plural, sessionDays, sessionTime } from "./format";
import { KIND, isClub, kindOf, norm, type EventKind } from "./kinds";
import { GrowRow } from "./parts";
import { attended } from "./record";

type Item = {
  e: SchoolEvent;
  kind: EventKind;
  /** The first session not over yet. */
  next: EventSession | null;
  /** Sessions Chronicle says the student went to (0: Chronicle doesn't say). */
  went: number;
};

const weekdayShort = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
const atNoon = (day: string) => Date.parse(`${day}T12:00:00Z`);

/**
 * Events in the day list's manner: what is coming up (or one plain line saying nothing is), the weekly clubs, then
 * the year by month, each month one block of rows split by hairlines. A row is its date, its title with its kind's
 * glyph, where and when, and "You went" when Chronicle says so (Compass never puts the two together). A club is one
 * row that opens to its sessions. Whether a session is over is read against now, not against the last sync.
 */
export function EventsPage({ data, chronicle, zone, today, now }: { data: Events; chronicle?: Chronicle | null; zone: string; today: string; now: number }) {
  const went = attended(chronicle);
  const items: Item[] = data.events.map(e => ({
    e,
    kind: kindOf(e),
    next: e.sessions.find(s => Date.parse(s.finish) >= now) ?? null,
    went: went.get(norm(e.title)) ?? 0,
  }));
  const clubs = items.filter(x => isClub(x.e));
  const once = items.filter(x => !isClub(x.e));
  const ahead = once.filter(x => x.next).sort((a, b) => a.next!.start.localeCompare(b.next!.start));
  const past = once.filter(x => !x.next).sort((a, b) => b.e.last.start.localeCompare(a.e.last.start));

  const months = new Map<string, Item[]>();
  for (const x of past) {
    const key = sessionDays(x.e.last, zone).first.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), x]);
  }
  const year = today.slice(0, 4);
  const monthLabel = (key: string) => (key.startsWith(year) ? monthLong : monthYear).format(atNoon(`${key}-01`));

  return (
    <>
      {ahead.length > 0 ? (
        <Group label="Coming up">
          {ahead.map(x => (
            <EventRow key={x.e.key} x={x} session={x.next!} zone={zone} today={today} now={now} />
          ))}
        </Group>
      ) : (
        <p className="flex items-center gap-2 px-1 type-body-sm text-text-2">
          <Icon icon={Calm} size={16} className="text-text-3" />
          <span className="min-w-0 truncate">
            Nothing coming up{past[0] && `. Last one ${ago(Date.parse(past[0].e.last.finish), now)}.`}
          </span>
        </p>
      )}

      {clubs.length > 0 && (
        <Group label={clubs.length === 1 ? "Club" : "Clubs"}>
          {clubs.map(x => (
            <ClubRow key={x.e.key} x={x} zone={zone} />
          ))}
        </Group>
      )}

      {[...months.entries()].map(([key, list]) => (
        <Group key={key} label={monthLabel(key)}>
          {list.map(x => (
            <EventRow key={x.e.key} x={x} session={x.e.last} zone={zone} today={today} now={now} />
          ))}
        </Group>
      ))}
    </>
  );
}

/** A small heading over one block of rows. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 className="mb-1.5 ps-1 type-label-sm text-text-2">{label}</h3>
      <div className="neo-stack neo-notice">{children}</div>
    </section>
  );
}

/** "Today", "Tomorrow", "In 3 days", "On now". */
function countdown(s: EventSession, zone: string, today: string, now: number) {
  if (Date.parse(s.start) <= now) return "On now";
  const n = daysApart(today, dayIn(zone, s.start));
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

/** "You went", from Chronicle: a check and quiet words at the start of a row's second line. */
function Went({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-3">
      <Icon icon={Check} size={12} />
      {children}
    </span>
  );
}

/** The date as the day list would set it: the day's number over its weekday, plain. */
function DateCol({ day }: { day: string }) {
  return (
    <div className="flex w-8 shrink-0 flex-col items-center">
      <span className="neo-st-daynum text-text-1">{Number(day.slice(8))}</span>
      <span className="type-caption text-text-3">{weekdayShort.format(atNoon(day))}</span>
    </div>
  );
}

/** The lead's face, at the row's end, named on hover. */
function Face({ e }: { e: SchoolEvent }) {
  if (!e.leadName) return null;
  return (
    <span title={e.leadName} className="shrink-0">
      <Avatar name={e.leadName} src={e.leadPhotoUrl ?? undefined} />
    </span>
  );
}

function EventRow({ x, session, zone, today, now }: { x: Item; session: EventSession; zone: string; today: string; now: number }) {
  const k = KIND[x.kind];
  const { first, last } = sessionDays(session, zone);
  // A camp over several days says when it ends; its clock times belong to its first and last days, not each one.
  const when = last !== first ? `Until ${weekdayShort.format(atNoon(last))} ${Number(last.slice(8))} ${monthShort.format(atNoon(last))}` : sessionTime(session, zone);
  const line = [session.place ?? x.e.place, when].filter(Boolean).join(" · ");
  const upcoming = Date.parse(session.finish) >= now;
  // Only an event with something more to say grows: its description, then where and when in full, then who runs it.
  const more = x.e.description ? (
    <div className="pt-0.5">
      <p className="neo-st-pre type-body-sm text-text-1">{x.e.description && <Linked text={x.e.description} />}</p>
      <p className="neo-tabular mt-0.5 type-caption text-text-2">{line}</p>
      {x.e.leadName && <p className="mt-2 type-caption text-text-3">{x.e.leadName}</p>}
    </div>
  ) : undefined;
  return (
    <GrowRow
      lead={<DateCol day={first} />}
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon icon={k.icon} size={14} label={k.label} className="text-text-3" />
          <span className="min-w-0 truncate">{x.e.title}</span>
        </span>
      }
      preview={
        <>
          {x.went > 0 && (
            <>
              <Went>You went</Went>
              {" · "}
            </>
          )}
          {line}
        </>
      }
      more={more}
      aside={
        <>
          {upcoming && <span className="shrink-0 type-label-sm text-text-2">{countdown(session, zone, today, now)}</span>}
          <Face e={x.e} />
        </>
      }
    />
  );
}

const listFormat = new Intl.ListFormat("en-AU", { style: "long", type: "conjunction" });

/**
 * A weekly club: one row ("8 of 21 sessions · Tuesdays"). Opened, it says it in words: when and where it meets, then
 * every session it had, month by month, then who runs it.
 */
function ClubRow({ x, zone }: { x: Item; zone: string }) {
  const k = KIND.club;
  const { e } = x;
  const p = pattern(e.sessions, zone);
  const byMonth = new Map<string, number[]>();
  for (const s of e.sessions) {
    const day = sessionDays(s, zone).first;
    byMonth.set(day.slice(0, 7), [...(byMonth.get(day.slice(0, 7)) ?? []), Number(day.slice(8))]);
  }
  const sessions = x.went ? `${x.went} of ${plural(e.sessions.length, "session")}` : plural(e.sessions.length, "session");
  const place = e.place ?? e.sessions.find(s => s.place)?.place;
  const meets = [p.weekday && p.time ? `${p.weekday}, ${p.time}` : (p.weekday ?? p.time), place && `in ${place}`].filter(Boolean).join(" ");
  const dates = [...byMonth.entries()].map(([m, days]) => `${listFormat.format(days.map(String))} ${monthShort.format(atNoon(`${m}-01`))}`).join("; ");
  return (
    <GrowRow
      lead={
        <div className="grid h-9 w-8 shrink-0 place-items-center">
          <Icon icon={k.icon} size={16} label={k.label} className="text-text-3" />
        </div>
      }
      title={e.title}
      preview={
        <>
          {x.went > 0 ? <Went>{sessions}</Went> : sessions}
          {p.weekday && ` · ${p.weekday}`}
        </>
      }
      more={
        <div className="pt-0.5">
          {meets && <p className="neo-tabular type-body-sm text-text-1">Meets {meets}</p>}
          <p className="neo-tabular mt-0.5 type-caption text-text-2">{dates}</p>
          {(x.went > 0 || e.leadName) && (
            <p className="mt-2 flex flex-wrap gap-x-3 type-caption text-text-3">
              {x.went > 0 && <Went>You went to {x.went}</Went>}
              {e.leadName && <span className="whitespace-nowrap">Run by {e.leadName}</span>}
            </p>
          )}
        </div>
      }
      aside={<Face e={e} />}
    />
  );
}
