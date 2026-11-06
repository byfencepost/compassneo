import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { Swap } from "@/features/grades/moving";
import { dayIn, dayName } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { useAttendance, useChronicle, useEvents, type EventSession, type SchoolEvent } from "./data";
import { attendanceTone, hueAccent, pageAccent, pctText, plural, tabular, toneFill, toneText } from "./format";
import { Glyph, type GlyphName } from "./glyph";
import { chronicleCounts, recordOf, yearOf } from "./record";
import { Ring } from "./parts";

/**
 * The way into the student's own pages from home, at its foot, as the web has it (apps/web/app/features/student/
 * shortcuts.tsx): one card of three, split by hairlines, each with its glyph in its page's colour and the one thing
 * worth knowing: the year's attendance on a small ring, the next event (or that there is none), the year's house
 * points (or the latest Chronicle entry, or what Compass counts but hides). Each opens its page.
 *
 * A value that changes (a sync brings a new share, the next event) gives way to the new one in place, its caption with
 * it; the ring beside the share turns to it rather than drawing in again.
 */
export function StudentShortcuts({ token, today, zone, now }: { token: string; today: string; zone: string; now: number }) {
  const c = useTheme();
  const attendance = useAttendance(token).data;
  const events = useEvents(token).data;
  const chronicle = useChronicle(token).data;

  // Attendance: the year's share of rolls present.
  const percent = attendance?.compass?.overall.percent ?? null;
  const attendanceTile: Shown =
    attendance === undefined
      ? "loading"
      : percent != null
        ? {
            lead: <Ring percent={percent} color={toneFill(attendanceTone(percent), c)} size={14} thickness={16} />,
            value: <Value color={toneText(attendanceTone(percent), c)}>{`${pctText(percent)}%`}</Value>,
            words: `${pctText(percent)}% this year`,
            caption: "this year",
          }
        : quiet("Not synced");

  // Events: the soonest still to come.
  const next = (events?.events ?? [])
    .map(e => ({ e, s: e.sessions.find(s => Date.parse(s.finish) >= now) }))
    .filter((x): x is { e: SchoolEvent; s: EventSession } => !!x.s)
    .sort((a, b) => a.s.start.localeCompare(b.s.start))[0];
  const eventsTile: Shown =
    events === undefined
      ? "loading"
      : !events
        ? quiet("Not synced")
        : next
          ? { value: <Value>{next.e.title}</Value>, words: `Next, ${next.e.title}, ${dayName(dayIn(zone, next.s.start), today)}`, caption: dayName(dayIn(zone, next.s.start), today) }
          : quiet("Nothing on", events.events.length ? `${events.events.length} this year` : "");

  // Chronicle: the year's record (house points, else commendations), the latest entry, or what Compass hides.
  const counts = chronicle ? chronicleCounts(chronicle) : null;
  const record = chronicle ? recordOf(yearOf(chronicle, zone, today).entries) : null;
  const latest = chronicle?.entries[0];
  const chronicleTile: Shown =
    chronicle === undefined
      ? "loading"
      : !chronicle || !counts || !record
        ? quiet("Not synced")
        : record.points > 0
          ? figure("housePoints", hueAccent(4, c), record.points, record.points === 1 ? "house point" : "house points")
          : record.commendations > 0
            ? figure("grade", hueAccent(2, c), record.commendations, record.commendations === 1 ? "commendation" : "commendations")
            : latest
              ? { value: <Value>{latest.title}</Value>, words: `Latest, ${latest.title}`, caption: latest.at ? dayName(dayIn(zone, latest.at), today) : "" }
              : counts.hidden
                ? { value: <Value>{plural(counts.hidden, "entry", "entries")}</Value>, words: `${plural(counts.hidden, "entry", "entries")} not shown to you`, caption: "not shown to you" }
                : quiet("No entries");

  return (
    <Card padded={false}>
      <View style={{ flexDirection: "row" }}>
        <Tile glyph="attendance" title="Attendance" accent={pageAccent("attendance", c, percent)} shown={attendanceTile} to="/attendance" />
        <Tile glyph="events" title="Events" accent={pageAccent("events", c)} shown={eventsTile} to="/events" divided />
        <Tile glyph="chronicle" title="Chronicle" accent={pageAccent("chronicle", c)} shown={chronicleTile} to="/chronicle" divided />
      </View>
    </Card>
  );
}

/**
 * What a tile shows under its name: a value (after `lead`, a ring or a glyph that stays put when the value changes),
 * its caption, and the two in words for a screen reader.
 */
type Shown = "loading" | { lead?: ReactNode; value: ReactNode; caption: string; words: string };

/** A value in the secondary ink: nothing to tell ("Nothing on"), with an optional caption. */
function quiet(text: string, caption = ""): Shown {
  return { value: <Value quiet>{text}</Value>, caption, words: [text, caption].filter(Boolean).join(", ") };
}

/** A count in its colour, beside its glyph ("★ 6", "house points"). */
function figure(glyph: GlyphName, color: string, n: number, caption: string): Shown {
  return {
    lead: <Glyph name={glyph} size={13} color={color} />,
    value: <Value color={color}>{String(n)}</Value>,
    caption,
    words: `${n} ${caption}`,
  };
}

/** A tile's one figure or line: 15pt and strong, cut short rather than wrapped. */
function Value({ children, color, quiet: q }: { children: string; color?: string; quiet?: boolean }) {
  return (
    <Text variant="label" tone={q ? "2" : "1"} color={color} numberOfLines={1} style={[tabular, { flexShrink: 1, fontWeight: "600", letterSpacing: -0.1 }]}>
      {children}
    </Text>
  );
}

/**
 * One third of the card, edge to edge: its glyph and name, the value, the caption. A hairline down its leading edge
 * (but the first's), and pressed in under the finger. The name shrinks a touch rather than cut on a narrow phone.
 */
function Tile({ glyph, title, accent, shown, to, divided }: { glyph: GlyphName; title: string; accent: string; shown: Shown; to: Href; divided?: boolean }) {
  const c = useTheme();
  const loading = shown === "loading";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? `${title}, loading` : `${title}, ${shown.words}`}
      accessibilityHint={`Opens ${title.toLowerCase()}`}
      accessibilityState={{ busy: loading }}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        router.push(to);
      }}
      style={({ pressed }) => [
        {
          flex: 1,
          minWidth: 0,
          // A third of a phone is about 106pt: 10 a side leaves the name its room.
          paddingHorizontal: 10,
          paddingTop: 10,
          paddingBottom: space[3],
          borderLeftWidth: divided ? 1 : 0,
          borderLeftColor: c.line,
        },
        pressed && { backgroundColor: c.lineFaint },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Glyph name={glyph} size={14} color={accent} />
        <Text variant="caption" tone="2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flexShrink: 1, fontWeight: "500" }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 22, marginTop: space[1.5] }}>
        {!loading && shown.lead}
        <Swap id={loading ? "" : shown.words} style={{ flexShrink: 1, flexDirection: "row", alignItems: "center" }}>
          {loading ? <Skeleton height={14} width={56} /> : shown.value}
        </Swap>
      </View>
      <Swap id={loading ? "" : shown.caption}>
        <Text variant="caption" tone="3" numberOfLines={1} style={{ minHeight: 17 }}>
          {loading ? "" : shown.caption}
        </Text>
      </Swap>
    </Pressable>
  );
}
