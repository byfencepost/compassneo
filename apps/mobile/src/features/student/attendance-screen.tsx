import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Rule } from "@/components/ui/card";
import { Segmented } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { shortDate } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { Arrive, Swap } from "@/features/grades/moving";
import { SubjectGlyph } from "@/features/grades/subject-glyph";
import { attendanceAt, STEPS, useAttendance, type Attendance, type AttendanceClass, type CompassAttendance, type ConnectAttendance } from "./data";
import { PeriodGrid, WeekChart } from "./attendance-weeks";
import { attendanceTone, markColor, markLabel, markOf, pageAccent, pctText, plural, tabular, toneFill, toneText, weekdayShort } from "./format";
import { Bar, Divided, FoldMore, Line, Loading, Notice, Ring, Row, ROW_X, Section, Swatch } from "./parts";
import { StudentFrame, useStudent } from "./page";

/**
 * The Attendance page, opened from its shortcut on home: the web's attendance panel (apps/web/app/features/student/
 * attendance.tsx) as one scroll under the native header. Pull to refresh fetches attendance from Compass (and Connect,
 * in WA) now.
 */
export function AttendanceScreen() {
  const c = useTheme();
  const { token, now } = useStudent();
  const q = useAttendance(token);
  const d = q.data;
  const accent = pageAccent("attendance", c, d?.compass?.overall.percent);
  const refresh = () => {
    if (!q.refreshing) void q.refresh();
  };
  return (
    <StudentFrame token={token} now={now} fetchedAt={attendanceAt(d)} steps={STEPS.attendance} refreshing={q.refreshing} onRefresh={refresh}>
      {d === undefined ? (
        <Loading label="Loading attendance" sections={[[56, 36], [40, 40, 40, 40], [36, 36]]} />
      ) : !d || (!d.compass && !d.connect) ? (
        <Notice
          glyph="attendance"
          accent={accent}
          title="No attendance yet"
          body="It comes in with the next sync."
          action={
            <Button size="sm" variant="secondary" pending={q.refreshing} pendingLabel="Getting attendance" onPress={refresh}>
              Get attendance now
            </Button>
          }
        />
      ) : (
        <AttendancePage data={d} accent={accent} />
      )}
    </StudentFrame>
  );
}

/**
 * Attendance as one story from both sides: the year's share of rolls present (Compass) with the year's absences
 * (Connect's unauthorised count where the school has Connect), then every class, week by week, every term, and a
 * term period by period. A term picked at the top (a glass segmented control across the page) narrows all of it to
 * that term. Classes not on the timetable now
 * (last semester's, excursion groups, exams) fold away at the foot of their list.
 *
 * The sections come into focus one after another as the page arrives (the chart, holding a glass switch, rises
 * instead). Picking a term moves what it can in place: the ring turns to the term's share, its figures give way to the
 * term's, and the classes' bars glide to their new lengths and the rows to their new order; what is the term's own
 * (its weeks, its periods, its absences) arrives anew.
 */
function AttendancePage({ data, accent }: { data: Attendance; accent: string }) {
  const c = useTheme();
  const { compass } = data;
  const connect = data.connect && "days" in data.connect ? data.connect : null;
  const connectError = data.connect && !("days" in data.connect) ? data.connect.error : null;
  const term = connect && connect.available && connect.days.length > 0 ? connect : null;

  // The year, or one term of it. Connect only gives the term under way and the year's totals, so its parts show for
  // the year and for the current term.
  const [span, setSpan] = useState("year");
  const terms = compass?.byTerm ?? [];
  const picked = span === "year" ? null : (terms.find(t => t.name === span) ?? null);
  const showConnect = !picked || picked.current;
  const connectLabel = term?.term ? `Term ${term.term}` : "This term";
  // Compass's rolls, day by day: the year's, or the picked term's.
  const inSpan = (date: string) => !picked || (date >= picked.firstDay && date <= picked.lastDay);
  const spanDays = (compass?.days ?? []).filter(d => inSpan(d.date));
  const spanAbsences = (compass?.absences ?? []).filter(a => inSpan(a.date));
  const shown =
    compass &&
    (picked
      ? // Older answers (before the term days were sent) have no days: no range rather than a broken date.
        { title: picked.name, range: picked.firstDay && picked.lastDay ? `${shortDate(picked.firstDay)} – ${shortDate(picked.lastDay)}` : null, ...picked }
      : { title: "This year", range: null, ...compass });

  return (
    <>
      {terms.length > 1 && (
        <Segmented
          label="Show attendance for"
          value={picked ? picked.name : "year"}
          onChange={setSpan}
          options={[{ value: "year", label: "Year" }, ...terms.map(t => ({ value: t.name, label: t.name }))]}
        />
      )}
      {compass && shown && (
        <Arrive index={0}>
          <Headline title={shown.title} range={shown.range} overall={shown.overall} classes={shown.classes} connect={showConnect && !picked ? connect : null} accent={accent} />
        </Arrive>
      )}
      {shown && shown.classes.length > 0 && (
        <Arrive index={1}>
          <ByClass classes={shown.classes} accent={accent} />
        </Arrive>
      )}
      {/* These three can come to nothing (too few weeks, no periods, no terms), so each arrives from inside itself. */}
      {spanDays.length > 0 ? (
        <WeekChart key={span} days={spanDays} label={shown?.title ?? "This year"} accent={accent} arrive={2} />
      ) : (
        term && showConnect && <WeekChart days={term.days} label={connectLabel} accent={accent} arrive={2} />
      )}
      {compass && !picked && <ByTerm terms={compass.terms} accent={accent} arrive={3} />}
      {spanDays.length > 0 ? (
        picked && <PeriodGrid key={span} days={spanDays} label={picked.name} accent={accent} arrive={3} />
      ) : (
        term && showConnect && <PeriodGrid days={term.days} label={connectLabel} accent={accent} arrive={3} />
      )}
      {spanAbsences.length > 0 && (
        <Arrive key={span} index={4}>
          <Absences items={spanAbsences} accent={accent} />
        </Arrive>
      )}
      {connectError && !term && (
        <Arrive index={5}>
          <Line glyph="warning" color={c.warnText}>
            This term’s periods didn’t come through from Connect. {connectError}
          </Line>
        </Arrive>
      )}
    </>
  );
}

// ---------- the span's headline ----------

function Headline({
  title,
  range,
  overall: o,
  classes,
  connect,
  accent,
}: {
  title: string;
  /** A term's dates ("2 Feb – 2 Apr"); null for the year. */
  range: string | null;
  overall: CompassAttendance["overall"];
  classes: AttendanceClass[];
  /** Connect's year totals: only with the year. */
  connect: ConnectAttendance | null;
  accent: string;
}) {
  const c = useTheme();
  if (o.percent == null) return <Notice glyph="attendance" accent={accent} title={range ? `No rolls marked in ${title}` : "No rolls marked yet this year"} />;
  const tone = attendanceTone(o.percent);
  // Connect's count is the department's own (for the year); otherwise Compass's rolls marked unauthorised.
  const unauthorised = connect ? connect.unauthorised : classes.reduce((a, k) => a + k.unauthorised, 0);
  const authorised = connect?.authorised ?? 0;
  const figures: { n: number; label: string; color: string }[] = [
    { n: o.absent, label: o.absent === 1 ? "class missed" : "classes missed", color: c.text1 },
    { n: o.late, label: "late", color: o.late ? c.warnText : c.text1 },
    ...(authorised ? [{ n: authorised, label: "authorised", color: c.text1 }] : []),
    { n: unauthorised, label: "unauthorised", color: unauthorised ? c.failText : c.text1 },
  ];
  return (
    <Section glyph="attendance" title={title} accent={accent}>
      <View
        accessible
        accessibilityLabel={`${pctText(o.percent)}% attendance${range ? ` in ${title}` : " this year"}. Present at ${o.present} of ${o.marked} rolls.`}
        style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[4], paddingVertical: 14 }}
      >
        <Ring percent={o.percent} color={toneFill(tone, c)} size={48} thickness={11} />
        <Swap id={`${o.percent}|${o.present}|${o.marked}|${range ?? ""}`} style={{ flex: 1, minWidth: 0 }}>
          <Text variant="heading" color={toneText(tone, c)} style={[tabular, { fontSize: 22, lineHeight: 26 }]}>
            {pctText(o.percent)}%
          </Text>
          <Text variant="caption" tone="2" numberOfLines={1} style={tabular}>
            Present at {o.present} of {o.marked} rolls
            {range ? <Text variant="caption" tone="3">{` · ${range}`}</Text> : null}
          </Text>
        </Swap>
      </View>
      <Rule />
      <Swap id={figures.map(f => `${f.n} ${f.label}`).join("|")} style={{ flexDirection: "row" }}>
        {figures.map((f, i) => (
          <View
            key={f.label}
            accessible
            accessibilityLabel={`${f.n} ${f.label}`}
            style={{ flex: 1, minWidth: 0, paddingHorizontal: figures.length === 4 ? 10 : ROW_X, paddingVertical: 10, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: c.lineFaint }}
          >
            <Text variant="label" color={f.color} style={[tabular, { fontWeight: "600" }]}>
              {f.n}
            </Text>
            <Text variant="caption" tone="2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {f.label}
            </Text>
          </View>
        ))}
      </Swap>
    </Section>
  );
}

// ---------- by class ----------

function ByClass({ classes, accent }: { classes: AttendanceClass[]; accent: string }) {
  // The classes on the timetable now have a colour; the rest (last semester's, excursion groups, exams) fold away.
  const timetabled = classes.filter(k => k.hue != null);
  const main = timetabled.length ? timetabled : classes;
  const other = timetabled.length ? classes.filter(k => k.hue == null) : [];
  const key = (k: AttendanceClass) => `${k.activityId}:${k.code}:${k.name}`;
  // Two groups can share a name ("Year 10 Exams"); their codes tell them apart.
  const shared = (k: AttendanceClass) => classes.filter(x => x.short === k.short).length > 1;
  return (
    <Section glyph="school" title="By class" accent={accent}>
      <Divided glides>
        {main.map(k => (
          <ClassRow key={key(k)} k={k} withCode={shared(k)} />
        ))}
      </Divided>
      {other.length > 0 && (
        <FoldMore label="Other classes and activities" count={other.length}>
          <Divided>
            {other.map(k => (
              <ClassRow key={key(k)} k={k} withCode={shared(k)} />
            ))}
          </Divided>
        </FoldMore>
      )}
    </Section>
  );
}

/** A class: its glyph in its colour, its rolls as a bar (present in its colour, late amber, absent red), the share. */
function ClassRow({ k, withCode }: { k: AttendanceClass; withCode?: boolean }) {
  const c = useTheme();
  const p = k.percent ?? (k.marked ? (100 * k.present) / k.marked : null);
  const tone = p != null ? attendanceTone(p) : null;
  const own = k.hue != null ? classColor(k.hue, c).accent : null;
  const code = withCode && k.code && k.code !== k.short ? k.code : null;
  return (
    <Row>
      <View
        accessible
        accessibilityLabel={`${k.short}${code ? ` ${code}` : ""}: ${p != null ? `${Math.round(p)}%` : "no share"}, ${k.absent ? `${k.absent} missed` : "none missed"}${k.late ? `, ${k.late} late` : ""}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}
      >
        <SubjectGlyph names={[k.short, k.name, k.code]} color={own ?? c.text3} size={16} />
        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
          {k.short}
          {code ? <Text variant="label" tone="3">{` · ${code}`}</Text> : null}
        </Text>
        <Text variant="caption" tone={k.absent ? "2" : "3"} style={tabular}>
          {k.absent ? `${k.absent} missed` : "None missed"}
        </Text>
        <Text variant="label" color={tone && tone !== "ok" ? toneText(tone, c) : c.text1} style={[tabular, { width: 42, textAlign: "right" }]}>
          {p != null ? `${Math.round(p)}%` : "–"}
        </Text>
      </View>
      {/* Under the name, so every class's bar starts at the same place. */}
      <Bar
        style={{ marginLeft: 16 + space[3], marginTop: space[1.5] }}
        parts={[
          { value: k.present, color: own ?? c.text3 },
          { value: k.late, color: c.warn },
          { value: k.absent, color: c.fail },
        ]}
      />
    </Row>
  );
}

// ---------- by term ----------

function ByTerm({ terms, accent, arrive }: { terms: CompassAttendance["terms"]; accent: string; arrive?: number }) {
  const c = useTheme();
  const rows = terms.map(t => ({ ...t, total: t.wholeDays + t.partialDays + t.halfDays + t.absentDays })).filter(t => t.total > 0);
  if (!rows.length) return null;
  // Every term on one scale, so the one under way is the short one.
  const max = Math.max(...rows.map(t => t.total));
  return (
    <Section glyph="calendar" title="By term" accent={accent} arrive={arrive}>
      <Divided>
        {rows.map(t => (
          <Row key={t.term}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[3] }}>
              <Text variant="label">{t.term}</Text>
              <Text variant="caption" tone="2" numberOfLines={1} style={[tabular, { flex: 1, textAlign: "right" }]}>
                <Text variant="caption" tone="ok">
                  {plural(t.wholeDays, "full day")}
                </Text>
                {t.partialDays > 0 && <Text variant="caption" tone="warn">{` · ${t.partialDays} partial`}</Text>}
                {t.halfDays > 0 && <Text variant="caption" tone="warn">{` · ${t.halfDays} half`}</Text>}
                {t.absentDays > 0 && <Text variant="caption" tone="fail">{` · ${t.absentDays} absent`}</Text>}
              </Text>
            </View>
            <Bar
              style={{ marginTop: space[1.5] }}
              scale={t.total / max}
              parts={[
                { value: t.wholeDays, color: c.ok },
                { value: t.partialDays + t.halfDays, color: c.warn },
                { value: t.absentDays, color: c.fail },
              ]}
            />
          </Row>
        ))}
      </Divided>
    </Section>
  );
}

// ---------- absences (Compass's rolls) ----------

type Absence = CompassAttendance["absences"][number];

/** Each day off or late in the span: when, why (Compass's reason), and which classes it took. */
function Absences({ items, accent }: { items: Absence[]; accent: string }) {
  // Classes missed first; clubs and events (a roll with no period: Robotics Club, a workshop) fold away on their own.
  const lessons = items.filter(a => a.classes.some(k => k.period != null));
  const extras = items.filter(a => !a.classes.some(k => k.period != null));
  const head = lessons.slice(0, 8);
  const rest = lessons.slice(8);
  const list = (rows: Absence[]) => (
    <Divided>
      {rows.map(a => (
        <AbsenceRow key={`${a.date}|${a.code}|${a.reason ?? ""}`} a={a} />
      ))}
    </Divided>
  );
  return (
    <Section glyph="warning" title="Absences and lates" accent={accent}>
      {list(head)}
      {rest.length > 0 && (
        <FoldMore label="Earlier" count={rest.length}>
          {list(rest)}
        </FoldMore>
      )}
      {extras.length > 0 && (
        <FoldMore label="Clubs and events" count={extras.length}>
          {list(extras)}
        </FoldMore>
      )}
    </Section>
  );
}

function AbsenceRow({ a }: { a: Absence }) {
  const c = useTheme();
  const mark = markOf(a.code, a.name);
  const classes = a.classes.map(k => (k.period != null ? `P${k.period} ${k.class}` : k.class)).join(" · ");
  const what = a.code === "L" ? `Late${a.reason ? ` · ${a.reason.toLowerCase()}` : ""}` : (a.reason ?? markLabel(a.name));
  const when = `${weekdayShort(a.date)} ${shortDate(a.date)}`;
  return (
    <Row>
      <View accessible accessibilityLabel={`${when}: ${what}. ${classes}`} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Swatch color={markColor(mark, c)} />
        <Text variant="caption" tone="2" numberOfLines={1} style={[tabular, { width: 78, fontWeight: "500" }]}>
          {when}
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>
            {what}
          </Text>
          <Text variant="caption" tone="3" numberOfLines={1}>
            {classes}
          </Text>
        </View>
        {a.classes.length > 1 && (
          <Text variant="caption" tone="3" style={tabular}>
            {a.classes.length}
          </Text>
        )}
      </View>
    </Row>
  );
}
