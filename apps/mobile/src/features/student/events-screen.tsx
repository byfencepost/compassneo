import type { ReactNode } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Arrive } from "@/features/grades/moving";
import { dayIn, daysApart } from "@/lib/days";
import { ago } from "@/lib/time";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { STEPS, useChronicle, useEvents, type Chronicle, type EventSession, type Events, type SchoolEvent } from "./data";
import { listOf, monthLong, monthShort, pageAccent, pattern, plural, sessionDays, sessionTime, tabular, weekdayShort } from "./format";
import { Glyph } from "./glyph";
import { KIND, isClub, kindOf, norm, type EventKind } from "./kinds";
import { Divided, Face, GrowRow, Line, Linked, Loading, Notice } from "./parts";
import { StudentFrame, useStudent } from "./page";
import { attended } from "./record";

/**
 * The Events page, opened from its shortcut on home: the web's events panel (apps/web/app/features/student/events.tsx)
 * as one scroll under the native header. Chronicle is read too, to say which events the student went to. Pull to
 * refresh fetches events from Compass now.
 */
export function EventsScreen() {
  const c = useTheme();
  const { token, zone, today, now } = useStudent();
  const q = useEvents(token);
  const chronicle = useChronicle(token).data;
  const d = q.data;
  const refresh = () => {
    if (!q.refreshing) void q.refresh();
  };
  return (
    <StudentFrame token={token} now={now} fetchedAt={d?.fetchedAt} steps={STEPS.events} refreshing={q.refreshing} onRefresh={refresh}>
      {d === undefined ? (
        <Loading label="Loading events" sections={[[40, 40], [36, 36, 36, 36]]} />
      ) : !d ? (
        <Notice
          glyph="events"
          accent={pageAccent("events", c)}
          title="No events yet"
          body="They come in with the next sync."
          action={
            <Button size="sm" variant="secondary" pending={q.refreshing} pendingLabel="Getting events" onPress={refresh}>
              Get events now
            </Button>
          }
        />
      ) : (
        <EventsPage data={d} chronicle={chronicle} zone={zone} today={today} now={now} />
      )}
    </StudentFrame>
  );
}

type Item = {
  e: SchoolEvent;
  kind: EventKind;
  /** The first session not over yet. */
  next: EventSession | null;
  /** Sessions Chronicle says the student went to (0: Chronicle doesn't say). */
  went: number;
};

/**
 * Events in the day list's manner: what is coming up (or one plain line saying nothing is), the weekly clubs, then
 * the year by month, each month one card of rows split by hairlines. A row is its date, its title with its kind's
 * glyph, where and when, and "You went" when Chronicle says so (Compass never puts the two together). A club is one
 * row that opens to its sessions. Whether a session is over is read against now, not against the last sync. The
 * groups come into focus one after another as the page arrives (a month that turns up later, as an event ends, comes
 * in on its own).
 */
function EventsPage({ data, chronicle, zone, today, now }: { data: Events; chronicle?: Chronicle | null; zone: string; today: string; now: number }) {
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
  const monthLabel = (key: string) => (key.startsWith(year) ? monthLong(`${key}-01`) : `${monthLong(`${key}-01`)} ${key.slice(0, 4)}`);

  return (
    <>
      {ahead.length > 0 ? (
        <Group label="Coming up" index={0}>
          {ahead.map(x => (
            <EventRow key={x.e.key} x={x} session={x.next!} zone={zone} today={today} now={now} />
          ))}
        </Group>
      ) : (
        <Arrive index={0}>
          <Line glyph="calm">Nothing coming up{past[0] ? `. Last one ${ago(Date.parse(past[0].e.last.finish), now)}.` : ""}</Line>
        </Arrive>
      )}

      {clubs.length > 0 && (
        <Group label={clubs.length === 1 ? "Club" : "Clubs"} index={1}>
          {clubs.map(x => (
            <ClubRow key={x.e.key} x={x} zone={zone} />
          ))}
        </Group>
      )}

      {[...months.entries()].map(([key, list], i) => (
        <Group key={key} label={monthLabel(key)} index={2 + i}>
          {list.map(x => (
            <EventRow key={x.e.key} x={x} session={x.e.last} zone={zone} today={today} now={now} />
          ))}
        </Group>
      ))}
    </>
  );
}

/** A small heading over one card of rows, arriving `index` beats after the page's first. */
function Group({ label, index, children }: { label: string; index: number; children: ReactNode }) {
  return (
    <Arrive index={index} style={{ gap: space[1.5] }}>
      <Text variant="caption" tone="2" accessibilityRole="header" style={{ fontWeight: "500", paddingHorizontal: space[1] }}>
        {label}
      </Text>
      <Card padded={false}>
        <Divided>{children}</Divided>
      </Card>
    </Arrive>
  );
}

/** "Today", "Tomorrow", "In 3 days", "On now". */
function countdown(s: EventSession, zone: string, today: string, now: number) {
  if (Date.parse(s.start) <= now) return "On now";
  const n = daysApart(today, dayIn(zone, s.start));
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

/** "You went", from Chronicle: a check and quiet words at the start of a row's second line. Nest it in a Text. */
function Went({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="3">
      ✓ {children}
    </Text>
  );
}

/** The date as the day list would set it: the day's number over its weekday, plain. */
function DateCol({ day }: { day: string }) {
  return (
    <View style={{ width: 32, alignItems: "center" }}>
      <Text variant="label" style={[tabular, { fontWeight: "600" }]}>
        {Number(day.slice(8))}
      </Text>
      <Text variant="caption" tone="3" style={{ fontSize: 11, lineHeight: 14 }}>
        {weekdayShort(day)}
      </Text>
    </View>
  );
}

function EventRow({ x, session, zone, today, now }: { x: Item; session: EventSession; zone: string; today: string; now: number }) {
  const c = useTheme();
  const k = KIND[x.kind];
  const { first, last } = sessionDays(session, zone);
  // A camp over several days says when it ends; its clock times belong to its first and last days, not each one.
  const when = last !== first ? `Until ${weekdayShort(last)} ${Number(last.slice(8))} ${monthShort(last)}` : sessionTime(session, zone);
  const line = [session.place ?? x.e.place, when].filter(Boolean).join(" · ");
  const upcoming = Date.parse(session.finish) >= now;
  const soon = upcoming ? countdown(session, zone, today, now) : null;
  // Only an event with something more to say grows: its description, then who runs it.
  const more = x.e.description ? (
    <View style={{ paddingTop: space[1], gap: space[1.5] }}>
      <Text variant="bodySm">
        <Linked text={x.e.description} />
      </Text>
      {x.e.leadName && (
        <Text variant="caption" tone="3">
          {x.e.leadName}
        </Text>
      )}
    </View>
  ) : undefined;
  return (
    <GrowRow
      label={[`${k.label}: ${x.e.title}`, `${weekdayShort(first)} ${Number(first.slice(8))} ${monthShort(first)}`, line, x.went > 0 && "you went", soon, x.e.leadName && `run by ${x.e.leadName}`]
        .filter(Boolean)
        .join(", ")}
      lead={<DateCol day={first} />}
      title={x.e.title}
      titleGlyph={<Glyph name={k.glyph} size={13} color={c.text3} />}
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
        (soon || x.e.leadName) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexShrink: 0 }}>
            {soon && (
              <Text variant="caption" tone="2" style={{ fontWeight: "500" }}>
                {soon}
              </Text>
            )}
            {x.e.leadName && <Face name={x.e.leadName} photoUrl={x.e.leadPhotoUrl} />}
          </View>
        )
      }
    />
  );
}

/**
 * A weekly club: one row ("8 of 21 sessions · Tuesdays"). Opened, it says it in words: when and where it meets, then
 * every session it had, month by month, then who runs it.
 */
function ClubRow({ x, zone }: { x: Item; zone: string }) {
  const c = useTheme();
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
  const dates = [...byMonth.entries()].map(([m, days]) => `${listOf(days.map(String))} ${monthShort(`${m}-01`)}`).join("; ");
  return (
    <GrowRow
      label={[`Club: ${e.title}`, sessions, p.weekday, e.leadName && `run by ${e.leadName}`].filter(Boolean).join(", ")}
      lead={
        <View style={{ width: 32, height: 36, alignItems: "center", justifyContent: "center" }}>
          <Glyph name="club" size={16} color={c.text3} />
        </View>
      }
      title={e.title}
      preview={
        <>
          {x.went > 0 ? <Went>{sessions}</Went> : sessions}
          {p.weekday ? ` · ${p.weekday}` : ""}
        </>
      }
      more={
        <View style={{ paddingTop: space[1], gap: 2 }}>
          {meets ? (
            <Text variant="bodySm" style={tabular}>
              Meets {meets}
            </Text>
          ) : null}
          <Text variant="caption" tone="2" style={tabular}>
            {dates}
          </Text>
          {(x.went > 0 || e.leadName) && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space[3], marginTop: space[1.5] }}>
              {x.went > 0 && <Went>{`You went to ${x.went}`}</Went>}
              {e.leadName && (
                <Text variant="caption" tone="3">
                  Run by {e.leadName}
                </Text>
              )}
            </View>
          )}
        </View>
      }
      aside={e.leadName ? <Face name={e.leadName} photoUrl={e.leadPhotoUrl} /> : undefined}
    />
  );
}
