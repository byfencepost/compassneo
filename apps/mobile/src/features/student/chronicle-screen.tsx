import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Arrive } from "@/features/grades/moving";
import { dayIn } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { space, type Palette } from "@/theme/tokens";
import { STEPS, useChronicle, useEvents, type Chronicle, type ChronicleEntry, type Events } from "./data";
import { fullDay, listOf, monthLong, pageAccent, plural, tabular, weekdayDay } from "./format";
import { Glyph, type GlyphName } from "./glyph";
import { KIND, kindOf, norm, type EventKind } from "./kinds";
import { Divided, Face, FoldSection, GrowRow, Line, Linked, Loading, Notice } from "./parts";
import { StudentFrame, useStudent } from "./page";
import { categoryOf, chronicleCounts, eventOf, isCommendation, isNotice, noteOf, noticeName, recordOf, valuesOf, yearOf } from "./record";

/**
 * The Chronicle page, opened from its shortcut on home: the web's Chronicle panel (apps/web/app/features/student/
 * chronicle.tsx) as one scroll under the native header. Events are read too, so an event the student went to wears
 * its kind's glyph. Pull to refresh fetches Chronicle from Compass now.
 */
export function ChronicleScreen() {
  const c = useTheme();
  const { token, zone, today, now } = useStudent();
  const q = useChronicle(token);
  const events = useEvents(token).data;
  const d = q.data;
  const accent = pageAccent("chronicle", c);
  const refresh = () => {
    if (!q.refreshing) void q.refresh();
  };
  return (
    <StudentFrame token={token} now={now} fetchedAt={d?.fetchedAt} steps={STEPS.chronicle} refreshing={q.refreshing} onRefresh={refresh}>
      {d === undefined ? (
        <Loading label="Loading Chronicle" sections={[[40, 40, 40], [36, 36]]} />
      ) : !d ? (
        <Notice
          glyph="chronicle"
          accent={accent}
          title="No Chronicle yet"
          body="It comes in with the next sync."
          action={
            <Button size="sm" variant="secondary" pending={q.refreshing} pendingLabel="Getting Chronicle" onPress={refresh}>
              Get Chronicle now
            </Button>
          }
        />
      ) : (
        <ChroniclePage data={d} events={events} zone={zone} today={today} accent={accent} />
      )}
    </StudentFrame>
  );
}

/**
 * Chronicle in the day list's manner: a line of what the year adds up to, then every entry by month, each month one
 * card of rows split by hairlines. A row is its glyph (green when it is good news), its title (the event's name for
 * an event the student went to), one line under it (the staff member's note, else where or what), and the date and
 * any points on the right; it opens to its fields. Attendance notices are one quiet row a month. Earlier years fold.
 * The year's line and the months come into focus one after another as the page arrives; a folded year's months open
 * plainly with it.
 */
function ChroniclePage({ data, events, zone, today, accent }: { data: Chronicle; events?: Events | null; zone: string; today: string; accent: string }) {
  const c = useTheme();
  const { entries } = data;
  const { categories, hidden } = chronicleCounts(data);

  if (!entries.length) {
    const withHidden = categories.filter(k => k.hidden > 0);
    return hidden > 0 ? (
      <Notice
        glyph="lock"
        accent={accent}
        title="Nothing here you can open"
        body={
          withHidden.length === 1
            ? `Compass counts ${plural(hidden, "entry", "entries")} in ${withHidden[0]!.category} that it doesn't show students.`
            : `Compass counts ${plural(hidden, "entry", "entries")} across ${withHidden.length} categories that it doesn't show students.`
        }
      />
    ) : (
      <Notice glyph="chronicle" accent={accent} title="Nothing from staff yet" body="House points, commendations and the events you go to show here as staff add them." />
    );
  }

  const year = today.slice(0, 4);
  const dayOf = (e: ChronicleEntry) => (e.at ? dayIn(zone, e.at) : null);
  const span = yearOf(data, zone, today);
  const summary = recordOf(span.entries);

  // The calendar's events, by name, so an entry wears its event's glyph.
  const kinds = new Map<string, EventKind>((events?.events ?? []).map(e => [norm(e.title), kindOf(e)]));

  const months = new Map<string, { items: ChronicleEntry[]; notices: ChronicleEntry[] }>();
  for (const e of entries) {
    const key = dayOf(e)?.slice(0, 7) ?? "undated";
    const m = months.get(key) ?? { items: [], notices: [] };
    (isNotice(e) ? m.notices : m.items).push(e);
    months.set(key, m);
  }
  const keys = [...months.keys()].sort().reverse();
  const recent = keys.filter(k => k.startsWith(year) || k === "undated");
  const years = [...new Set(keys.filter(k => !recent.includes(k)).map(k => k.slice(0, 4)))];
  const month = (k: string, index?: number) => (
    <Month key={k} label={k === "undated" ? "Undated" : monthLong(`${k}-01`)} {...months.get(k)!} kinds={kinds} zone={zone} index={index} />
  );

  const parts = (
    [
      [summary.points, Math.abs(summary.points) === 1 ? "house point" : "house points"],
      [summary.commendations, summary.commendations === 1 ? "commendation" : "commendations"],
      [summary.events, summary.events === 1 ? "event" : "events"],
    ] as [number, string][]
  ).filter(([n]) => n !== 0);

  return (
    <>
      {parts.length > 0 && (
        <Arrive>
          <Text variant="bodySm" tone="2" style={[tabular, { paddingHorizontal: space[1] }]}>
            {parts.map(([n, label], i) => (
              <Text key={label} variant="bodySm" tone="2">
                {i > 0 && " · "}
                <Text variant="bodySm" style={{ fontWeight: "600" }}>
                  {n}
                </Text>{" "}
                {label}
              </Text>
            ))}
            {span.thisYear ? " this year" : ""}
          </Text>
        </Arrive>
      )}

      {recent.map((k, i) => month(k, i + 1))}

      {years.map((y, j) => {
        const ks = keys.filter(k => k.startsWith(y));
        const n = ks.reduce((a, k) => a + months.get(k)!.items.length, 0);
        return (
          <Arrive key={y} index={recent.length + 1 + j}>
            <FoldSection glyph="time" title={y} accent={accent} count={plural(n, "entry", "entries")} defaultOpen={recent.length === 0 && y === years[0]}>
              <View style={{ gap: space[4] }}>{ks.map(k => month(k))}</View>
            </FoldSection>
          </Arrive>
        );
      })}

      {hidden > 0 && (
        <Line glyph="lock" color={c.text3}>
          Compass also counts {plural(hidden, "entry", "entries")} that students can’t open.
        </Line>
      )}
    </>
  );
}

/**
 * One month: its name, then one card of its entries, its attendance notices last as a single quiet row. Given `index`,
 * it arrives that many beats after the page's first; without (a folded year's), it is simply there.
 */
function Month({
  label,
  items,
  notices,
  kinds,
  zone,
  index,
}: {
  label: string;
  items: ChronicleEntry[];
  notices: ChronicleEntry[];
  kinds: Map<string, EventKind>;
  zone: string;
  index?: number;
}) {
  const body = (
    <>
      <Text variant="caption" tone="2" accessibilityRole="header" style={{ fontWeight: "500", paddingHorizontal: space[1] }}>
        {label}
      </Text>
      <Card padded={false}>
        <Divided>
          {items.map(e => (
            <Entry key={e.id} e={e} kinds={kinds} zone={zone} />
          ))}
          {notices.length > 0 && <Notices key="notices" notices={notices} zone={zone} />}
        </Divided>
      </Card>
    </>
  );
  if (index == null) return <View style={{ gap: space[1.5] }}>{body}</View>;
  return (
    <Arrive index={index} style={{ gap: space[1.5] }}>
      {body}
    </Arrive>
  );
}

const dayLabel = (e: ChronicleEntry, zone: string) => (e.at ? weekdayDay(dayIn(zone, e.at)) : null);

/** The glyph a row leads with: green only for good news; an event's own kind; otherwise quiet. */
function glyphOf(e: ChronicleEntry, kinds: Map<string, EventKind>, c: Palette): { glyph: GlyphName; color: string; label: string } {
  const ev = eventOf(e);
  if (ev) {
    const k = KIND[kinds.get(norm(ev.name)) ?? kindOf({ kind: "event", title: ev.name, place: ev.place, sessions: [] })];
    return { glyph: k.glyph, color: c.text3, label: k.label };
  }
  if (e.rating === "positive") return { glyph: isCommendation(e) ? "grade" : e.points > 0 ? "housePoints" : "commendation", color: c.okText, label: "Positive" };
  if (e.rating === "caution") return { glyph: "warning", color: c.warnText, label: "Caution" };
  if (e.rating === "concern") return { glyph: "failed", color: c.failText, label: "Concern" };
  return { glyph: /letter/i.test(e.category ?? "") ? "letter" : "info", color: c.text3, label: "Note" };
}

function Entry({ e, kinds, zone }: { e: ChronicleEntry; kinds: Map<string, EventKind>; zone: string }) {
  const c = useTheme();
  const ev = eventOf(e);
  const g = glyphOf(e, kinds, c);
  const note = ev ? null : noteOf(e);
  const preview = ev
    ? [ev.place, ev.time, ev.sessions > 1 ? `${ev.sessions} sessions` : null].filter(Boolean).join(" · ")
    : (note ?? [categoryOf(e), e.by].filter(Boolean).join(" · "));
  const day = dayLabel(e, zone);

  // Opened, it reads as the note itself (the preview, run to its full length), then the short answers in one quiet
  // line, then who and when. Nothing the row already says, none of Compass's template prompts. An entry with no fields
  // has nothing to open.
  const line = (ev ? [[ev.date, ev.time].filter(Boolean).join(", "), ev.sessions > 1 ? `${ev.sessions} sessions` : null] : valuesOf(e)).filter(Boolean).join(" · ");
  const who = [e.by, e.at && !ev ? fullDay(dayIn(zone, e.at)) : null].filter(Boolean).join(" · ");
  const more = e.fields.some(f => f.value.trim()) ? (
    <View style={{ paddingTop: space[1], gap: space[1.5] }}>
      {line ? (
        <Text variant="caption" tone="2" style={tabular}>
          {line}
        </Text>
      ) : null}
      {who ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
          {e.by && <Face name={e.by} photoUrl={e.byPhotoUrl} size={20} />}
          <Text variant="caption" tone="3" numberOfLines={1} style={{ flex: 1 }}>
            {who}
          </Text>
        </View>
      ) : null}
    </View>
  ) : undefined;

  return (
    <GrowRow
      label={[`${g.label}: ${ev ? ev.name : e.title}`, day, e.points ? `${e.points > 0 ? "plus" : "minus"} ${Math.abs(e.points)} ${Math.abs(e.points) === 1 ? "point" : "points"}` : null, preview]
        .filter(Boolean)
        .join(", ")}
      lead={
        <View style={{ paddingTop: 2 }}>
          <Glyph name={g.glyph} size={16} color={g.color} />
        </View>
      }
      title={ev ? ev.name : e.title}
      preview={note && more ? <Linked text={note} /> : preview}
      more={more}
      aside={
        <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
          {day && (
            <Text variant="caption" tone="2" style={[tabular, { fontWeight: "500" }]}>
              {day}
            </Text>
          )}
          {e.points !== 0 && (
            <Text variant="caption" tone={e.points > 0 ? "ok" : "fail"} style={tabular}>
              {e.points > 0 ? "+" : ""}
              {e.points}
            </Text>
          )}
        </View>
      }
    />
  );
}

/**
 * A month's attendance notices, as one quiet row that grows to list them: by day, and by name too when they were not
 * all the same (one name is already in the row).
 */
function Notices({ notices, zone }: { notices: ChronicleEntry[]; zone: string }) {
  const c = useTheme();
  const names = [...new Set(notices.map(noticeName))];
  const days = notices.map(n => dayLabel(n, zone)).filter((d): d is string => !!d);
  return (
    <GrowRow
      dim
      label={`${plural(notices.length, "attendance notice")}: ${names.join(", ")}`}
      lead={
        <View style={{ paddingTop: 2 }}>
          <Glyph name="notice" size={16} color={c.text3} />
        </View>
      }
      title={plural(notices.length, "attendance notice")}
      preview={names.join(", ")}
      more={
        names.length === 1 ? (
          days.length > 0 ? (
            <Text variant="caption" tone="3" style={[tabular, { paddingTop: space[1] }]}>
              {listOf([...days].reverse())}
            </Text>
          ) : undefined
        ) : (
          <View style={{ paddingTop: space[1], gap: 2 }}>
            {notices.map(n => (
              <View key={n.id} style={{ flexDirection: "row", gap: space[3] }}>
                <Text variant="caption" tone="3" style={[tabular, { width: 52 }]}>
                  {dayLabel(n, zone)}
                </Text>
                <Text variant="caption" tone="2" style={{ flex: 1 }}>
                  {noticeName(n)}
                </Text>
              </View>
            ))}
          </View>
        )
      }
    />
  );
}
