import { Fragment, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { SourceMark, type Source } from "@/components/brand/source-mark";
import { Attendance as AttendanceGlyph, Calendar, ChartLine, Icon, School, TableView, Warning } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { SegmentedControl, SegmentedControlItem } from "@/components/glaze/ui/segmented-control";
import { spring } from "@/lib/neo/motion";
import { addDays, longDay, shortDate } from "@/lib/neo/days";
import { subjectIcon } from "@/lib/neo/subjects";
import type { Attendance, AttendanceClass, CompassAttendance, ConnectAttendance } from "@/lib/neo/student";
import { attendanceTone, markLabel, markOf, mondayOf, pctText, plural, toneText, weekdayIndex, type Mark } from "./format";
import { Bar, FoldMore, Notice, Ring, Row, Section } from "./parts";

/**
 * Attendance as one story from both sides: the year's share of rolls present (Compass) with the year's absences
 * (Connect's unauthorised count where the school has Connect), then every class, every term, and this term period by
 * period (Connect). Classes not on the timetable now (last semester's, excursion groups, exams) fold away at the foot
 * of their list.
 */
export function AttendancePage({ data }: { data: Attendance }) {
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
  const shown = compass && (picked ? { title: picked.name, // Older answers (before the term days were sent) have no days: no range rather than a broken date.
          range: picked.firstDay && picked.lastDay ? `${shortDate(picked.firstDay)} – ${shortDate(picked.lastDay)}` : null, ...picked } : { title: "This year", range: null, ...compass });

  return (
    <>
      {terms.length > 1 && (
        <SegmentedControl size="sm" fill aria-label="Show attendance for" value={picked ? picked.name : "year"} onValueChange={setSpan} className="w-full">
          <SegmentedControlItem value="year">Year</SegmentedControlItem>
          {terms.map(t => (
            <SegmentedControlItem key={t.name} value={t.name}>
              {t.name}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      )}
      {compass && shown && (
        <Headline title={shown.title} range={shown.range} overall={shown.overall} classes={shown.classes} connect={showConnect && !picked ? connect : null} />
      )}
      {shown && shown.classes.length > 0 && <ByClass classes={shown.classes} />}
      {spanDays.length > 0 ? (
        <TermChart c={{ days: spanDays }} label={shown?.title ?? "This year"} source="compass" />
      ) : (
        term && showConnect && <TermChart c={term} label={connectLabel} source="connect" />
      )}
      {compass && !picked && <ByTerm terms={compass.terms} />}
      {spanDays.length > 0 ? (
        picked && <TermByPeriod c={{ days: spanDays }} label={picked.name} source="compass" />
      ) : (
        term && showConnect && <TermByPeriod c={term} label={connectLabel} source="connect" />
      )}
      {spanAbsences.length > 0 && <Absences items={spanAbsences} />}
      {connectError && !term && (
        <p className="flex items-start gap-2 px-1 type-body-sm text-text-2">
          <Icon icon={Warning} size={16} className="mt-0.5 text-warn-text" />
          <span className="min-w-0">This term&rsquo;s periods didn&rsquo;t come through from Connect. {connectError}</span>
        </p>
      )}
    </>
  );
}

// ---------- this year ----------

function Headline({
  title,
  range,
  overall: o,
  classes,
  connect,
}: {
  title: string;
  /** A term's dates ("2 Feb – 2 Apr"); null for the year. */
  range: string | null;
  overall: CompassAttendance["overall"];
  classes: AttendanceClass[];
  /** Connect's year totals: only with the year. */
  connect: ConnectAttendance | null;
}) {
  if (o.percent == null) return <Notice icon={AttendanceGlyph} title={range ? `No rolls marked in ${title}` : "No rolls marked yet this year"} />;
  const tone = attendanceTone(o.percent);
  // Connect's count is the department's own (for the year); otherwise Compass's rolls marked unauthorised.
  const unauthorised = connect ? connect.unauthorised : classes.reduce((a, c) => a + c.unauthorised, 0);
  const authorised = connect?.authorised ?? 0;
  const figures: Array<{ n: number; label: string; tone?: "warn" | "fail"; source?: Source }> = [
    { n: o.absent, label: o.absent === 1 ? "class missed" : "classes missed" },
    { n: o.late, label: "late", tone: o.late ? "warn" : undefined },
    ...(authorised ? [{ n: authorised, label: "authorised", source: "connect" as const }] : []),
    { n: unauthorised, label: "unauthorised", tone: unauthorised ? "fail" : undefined, source: connect ? ("connect" as const) : undefined },
  ];
  return (
    <Section icon={AttendanceGlyph} title={title} source="compass">
      <div className="flex items-center gap-4 px-4 py-3.5">
        <Ring percent={o.percent} tone={tone} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className={cn("neo-st-hero", toneText[tone])}>{pctText(o.percent)}%</p>
          <p className="neo-tabular mt-0.5 truncate type-label-sm text-text-2">
            Present at {o.present} of {o.marked} rolls
            {range && <span className="text-text-3"> · {range}</span>}
          </p>
        </div>
      </div>
      <div className={cn("grid border-t border-line-faint", figures.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {figures.map((f, i) => (
          <div key={f.label} className={cn("min-w-0 px-3.5 py-2.5", i > 0 && "border-s border-line-faint")}>
            <p className={cn("neo-st-figure flex items-center gap-1.5", f.tone ? toneText[f.tone] : "text-text-1")}>
              {f.n}
              {f.source && <SourceMark source={f.source} size={12} />}
            </p>
            <p className="truncate type-caption text-text-2">{f.label}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------- by class ----------

function ByClass({ classes }: { classes: AttendanceClass[] }) {
  // The classes on the timetable now have a colour; the rest (last semester's, excursion groups, exams) fold away.
  const timetabled = classes.filter(c => c.hue != null);
  const main = timetabled.length ? timetabled : classes;
  const other = timetabled.length ? classes.filter(c => c.hue == null) : [];
  const key = (c: AttendanceClass) => `${c.activityId}:${c.code}:${c.name}`;
  // Two groups can share a name ("Year 10 Exams"); their codes tell them apart.
  const shared = (c: AttendanceClass) => classes.filter(x => x.short === c.short).length > 1;
  return (
    <Section icon={School} title="By class" source="compass">
      {main.map(c => (
        <ClassRow key={key(c)} c={c} withCode={shared(c)} />
      ))}
      {other.length > 0 && (
        <FoldMore label="Other classes and activities" count={other.length}>
          {other.map(c => (
            <ClassRow key={key(c)} c={c} withCode={shared(c)} />
          ))}
        </FoldMore>
      )}
    </Section>
  );
}

/** A class: its glyph in its colour, its rolls as a bar (present in its colour, late amber, absent red), the share. */
function ClassRow({ c, withCode }: { c: AttendanceClass; withCode?: boolean }) {
  const p = c.percent ?? (c.marked ? (100 * c.present) / c.marked : null);
  const tone = p != null ? attendanceTone(p) : null;
  const coloured = c.hue != null;
  const code = withCode && c.code && c.code !== c.short ? c.code : null;
  return (
    <Row>
      <div data-hue={c.hue ?? undefined}>
        <div className="flex items-center gap-3">
          <Icon icon={subjectIcon(c.short, c.name, c.code)} size={16} className={coloured ? "neo-glyph" : "text-text-3"} />
          <span className="min-w-0 flex-1 truncate type-label text-text-1">
            {c.short}
            {code && <span className="text-text-3"> · {code}</span>}
          </span>
          <span className={cn("neo-tabular shrink-0 type-caption", c.absent ? "text-text-2" : "text-text-3")}>
            {c.absent ? `${c.absent} missed` : "None missed"}
          </span>
          <span className={cn("neo-tabular w-10 shrink-0 text-end type-label", tone && tone !== "ok" ? toneText[tone] : "text-text-1")}>
            {p != null ? `${Math.round(p)}%` : "–"}
          </span>
        </div>
        {/* Under the name, so every class's bar starts at the same place. */}
        <Bar
          className="ms-7 mt-1.5"
          parts={[
            { value: c.present, mark: coloured ? "class" : "other" },
            { value: c.late, mark: "late" },
            { value: c.absent, mark: "absent" },
          ]}
        />
      </div>
    </Row>
  );
}

// ---------- by term ----------

function ByTerm({ terms }: { terms: CompassAttendance["terms"] }) {
  const rows = terms.map(t => ({ ...t, total: t.wholeDays + t.partialDays + t.halfDays + t.absentDays })).filter(t => t.total > 0);
  if (!rows.length) return null;
  // Every term on one scale, so the one under way is the short one.
  const max = Math.max(...rows.map(t => t.total));
  return (
    <Section icon={Calendar} title="By term" source="compass">
      {rows.map(t => (
        <Row key={t.term}>
          <div className="flex items-baseline gap-3">
            <span className="shrink-0 type-label text-text-1">{t.term}</span>
            <span className="neo-tabular min-w-0 flex-1 truncate text-end type-caption text-text-2">
              <span className="text-ok-text">{plural(t.wholeDays, "full day")}</span>
              {t.partialDays > 0 && (
                <>
                  {" · "}
                  <span className="text-warn-text">{t.partialDays} partial</span>
                </>
              )}
              {t.halfDays > 0 && (
                <>
                  {" · "}
                  <span className="text-warn-text">{t.halfDays} half</span>
                </>
              )}
              {t.absentDays > 0 && (
                <>
                  {" · "}
                  <span className="text-fail-text">{t.absentDays} absent</span>
                </>
              )}
            </span>
          </div>
          <Bar
            className="mt-1.5"
            scale={t.total / max}
            parts={[
              { value: t.wholeDays, mark: "present" },
              { value: t.partialDays + t.halfDays, mark: "late" },
              { value: t.absentDays, mark: "absent" },
            ]}
          />
        </Row>
      ))}
    </Section>
  );
}

// ---------- this term, week by week (Connect) ----------

/**
 * Attendance over the span (a term, or the year) week by week, as one line: Overall (the share present so far, week on
 * week, the default) or Each week (that week's own share). The scale fits the line shown. Many weeks (the year) are
 * labelled by month; a term's by week number.
 */
function TermChart({ c, label, source }: { c: { days: Day[] }; label: string; source: Source }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const plot = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<number | null>(null);
  const [mode, setMode] = useState<"overall" | "week">("overall");

  const byWeek = new Map<string, { present: number; marked: number }>();
  for (const d of [...c.days].filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date))) {
    if (weekdayIndex(d.date) > 4) continue;
    const w = byWeek.get(mondayOf(d.date)) ?? { present: 0, marked: 0 };
    for (const p of d.periods) {
      const m = markOf(p.code, p.name);
      if (m === "none") continue;
      w.marked += 1;
      if (m === "present") w.present += 1;
    }
    byWeek.set(mondayOf(d.date), w);
  }
  let runPresent = 0;
  let runMarked = 0;
  const weeks = [...byWeek.entries()]
    .filter(([, w]) => w.marked > 0)
    .map(([monday, w]) => {
      runPresent += w.present;
      runMarked += w.marked;
      return { monday, week: (100 * w.present) / w.marked, term: (100 * runPresent) / runMarked, ...w };
    });
  if (weeks.length < 2) return null;

  const n = weeks.length;
  const val = (w: (typeof weeks)[number]) => (mode === "overall" ? w.term : w.week);
  const values = weeks.map(val);
  const hi = 100;
  const span = hi - Math.min(...values);
  const step = span <= 8 ? 2 : span <= 20 ? 5 : 10;
  const lo = Math.max(0, Math.floor((Math.min(...values) - step / 2) / step) * step);
  const ticks: number[] = [];
  for (let v = hi - step; v > lo; v -= step) ticks.push(v);
  const shownTicks = ticks.length > 3 ? ticks.filter((_, i) => i % 2 === 1) : ticks;
  const xAt = (i: number) => 3 + (94 * i) / (n - 1);
  const yAt = (v: number) => 100 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  const line = weeks.map((w, i) => `${i ? "L" : "M"}${xAt(i).toFixed(2)} ${yAt(val(w)).toFixed(2)}`).join(" ");
  const area = `${line} L${xAt(n - 1).toFixed(2)} 100 L${xAt(0).toFixed(2)} 100 Z`;
  const last = weeks[n - 1]!;
  const tone = attendanceTone(last.term);

  // Labels under the line: by month when there are many weeks (a year), else every few week numbers.
  const month = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleString("en-AU", { month: "short", timeZone: "UTC" });
  const every = Math.max(1, Math.ceil(n / 7));
  const labels = weeks.map((w, i) =>
    n > 14 ? (i === 0 || month(w.monday) !== month(weeks[i - 1]!.monday) ? month(w.monday) : null) : i % every === 0 || i === n - 1 ? `W${i + 1}` : null,
  );
  // Months that start a week apart would collide: keep one label per few weeks.
  let lastShown = -Infinity;
  const spaced = labels.map((l, i) => {
    if (!l || i - lastShown < Math.max(2, Math.ceil(n / 9))) return null;
    lastShown = i;
    return l;
  });

  const point = (e: React.PointerEvent) => {
    const r = plot.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 100;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
    setOn(best);
  };
  const shown = on != null ? weeks[on]! : null;
  const tipBelow = shown ? yAt(val(shown)) < 45 : false;

  return (
    <Section
      icon={ChartLine}
      title={`${label} week by week`}
      source={source}
      aside={<span className={cn("neo-tabular type-label-sm", toneText[tone])}>{pctText(last.term)}% so far</span>}
      className="px-4 pt-4 pb-3.5"
    >
      <figure className="m-0">
        <p className="sr-only">
          {`Attendance by week, from ${pctText(weeks[0]!.week)}% in the week of ${shortDate(weeks[0]!.monday)} to ${pctText(last.week)}% in the week of ${shortDate(last.monday)}; ${pctText(last.term)}% so far.`}
        </p>
        <div aria-hidden className="relative ps-1 pe-7">
          <div ref={plot} className="relative h-36 touch-pan-y" onPointerMove={point} onPointerDown={point} onPointerLeave={() => setOn(null)}>
            {[...shownTicks, hi].map(v => (
              <span
                key={v}
                // eslint-disable-next-line glaze/no-inline-style -- a label placed at its value on the chart's scale
                style={{ top: `${yAt(v)}%` }}
                className="neo-tabular absolute -end-7 -translate-y-1/2 type-caption text-text-3"
              >
                {v}
              </span>
            ))}
            <motion.div
              key={mode}
              className="absolute inset-0"
              initial={{ clipPath: "inset(-12px 100% -12px -12px)" }}
              animate={{ clipPath: "inset(-12px -12px -12px -12px)" }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                <defs>
                  <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" className="neo-chart-area-hi" />
                    <stop offset="1" className="neo-chart-area-lo" />
                  </linearGradient>
                </defs>
                {[...shownTicks, hi].map(v => (
                  <line key={v} x1={0} x2={100} y1={yAt(v)} y2={yAt(v)} className="neo-chart-grid" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={area} fill={`url(#${gid}a)`} />
                <path d={line} fill="none" className="neo-chart-line" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {(n <= 20 || on != null) &&
                weeks.map((w, i) =>
                  n <= 20 || on === i ? (
                    <span
                      key={w.monday}
                      data-on={on === i || undefined}
                      className="neo-chart-dot"
                      // eslint-disable-next-line glaze/no-inline-style -- a point placed at its value on the chart's scale
                      style={{ left: `${xAt(i)}%`, top: `${yAt(val(w))}%` }}
                    />
                  ) : null,
                )}
            </motion.div>

            {shown && on != null && (
              <>
                <span
                  className="neo-chart-guide absolute inset-y-0 w-px"
                  // eslint-disable-next-line glaze/no-inline-style -- the guide follows the point under the pointer
                  style={{ left: `${xAt(on)}%` }}
                />
                <motion.div
                  key={on}
                  initial={{ opacity: 0, y: tipBelow ? -4 : 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring.snap}
                  className={cn("neo-chart-tip absolute z-10 px-2.5 py-1.5", !tipBelow && "-translate-y-full")}
                  // eslint-disable-next-line glaze/no-inline-style -- the tip sits by its point, kept inside the chart
                  style={{
                    left: `clamp(0px, calc(${xAt(on)}% - 5rem), calc(100% - 10rem))`,
                    top: tipBelow ? `calc(${yAt(val(shown))}% + 12px)` : `calc(${yAt(val(shown))}% - 10px)`,
                  }}
                >
                  <p className="type-label-sm text-text-1">Week of {shortDate(shown.monday)}</p>
                  <p className="neo-tabular type-caption text-text-2">
                    {pctText(shown.term)}% so far · {pctText(shown.week)}% that week
                  </p>
                </motion.div>
              </>
            )}
          </div>
          <div className="relative mt-1.5 h-4">
            {weeks.map((w, i) =>
              spaced[i] ? (
                <span
                  key={w.monday}
                  // eslint-disable-next-line glaze/no-inline-style -- a week's label under its point
                  style={{ left: `${xAt(i)}%` }}
                  className={cn("neo-tabular absolute -translate-x-1/2 whitespace-nowrap type-caption", on === i ? "text-text-1" : "text-text-3")}
                >
                  {spaced[i]}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <div className="mt-3">
          <SegmentedControl size="sm" aria-label="Show" value={mode} onValueChange={v => setMode(v as "overall" | "week")}>
            <SegmentedControlItem value="overall">Overall</SegmentedControlItem>
            <SegmentedControlItem value="week">Each week</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </figure>
    </Section>
  );
}

// ---------- this term, period by period (Connect) ----------

/** A school day period by period: Connect's term grid, or Compass's rolls (which also say the class and the reason). */
type Day = { date: string; periods: Array<{ period: number; code: string; name: string; reason?: string | null; class?: string }> };
type Marked = Day["periods"][number] & { mark: Mark };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * The term as a calendar: a row a week, a column a weekday, and in each day its periods top to bottom as small bars
 * in their mark's colour. Periods never marked all term (before school, recess, lunch) are left out. A day picked
 * (the latest with something to note, to start) says what its marks were under the grid. The arrow keys move the
 * pick a day or a week; the grid is one tab stop.
 */
function TermByPeriod({ c, label, source }: { c: { days: Day[] }; label: string; source: Source }) {
  const days = c.days.filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date));
  const periods = [...new Set(days.flatMap(d => d.periods.filter(p => p.code !== "-").map(p => p.period)))].sort((a, b) => a - b);
  const marksOf = (d: Day): Marked[] =>
    periods.map(n => {
      const p = d.periods.find(x => x.period === n);
      return p ? { ...p, mark: markOf(p.code, p.name) } : { period: n, code: "-", name: "Not recorded", mark: "none" };
    });
  const notable = (d: Day) => marksOf(d).filter(p => p.mark !== "present" && p.mark !== "none");

  const weeks: Array<{ monday: string; slots: Array<Day | null> }> = [];
  for (const d of days) {
    const i = weekdayIndex(d.date);
    if (i > 4) continue;
    const monday = mondayOf(d.date);
    let w = weeks[weeks.length - 1];
    if (!w || w.monday !== monday) weeks.push((w = { monday, slots: [null, null, null, null, null] }));
    w.slots[i] = d;
  }

  // The key: each mark seen in the grid and how many periods had it, present first.
  const counts = new Map<string, { name: string; mark: Mark; n: number }>();
  for (const d of days)
    for (const p of marksOf(d)) {
      const k = p.mark === "none" ? "-" : p.code;
      const e = counts.get(k) ?? { name: p.mark === "none" ? "Not marked" : p.name, mark: p.mark, n: 0 };
      e.n += 1;
      counts.set(k, e);
    }
  const order: Mark[] = ["present", "late", "authorised", "absent", "other", "none"];
  const key = [...counts.values()].sort((a, b) => order.indexOf(a.mark) - order.indexOf(b.mark) || b.n - a.n);
  const recorded = key.filter(k => k.mark !== "none").reduce((a, k) => a + k.n, 0);
  const present = key.filter(k => k.mark === "present").reduce((a, k) => a + k.n, 0);
  const share = recorded ? (100 * present) / recorded : null;

  const latest = days[days.length - 1];
  const start = [...days].reverse().find(d => notable(d).length > 0) ?? latest;
  const [picked, setPicked] = useState<string | null>(null);
  const sel = days.find(d => d.date === picked) ?? start;
  const cells = useRef(new Map<string, HTMLButtonElement>());
  if (!sel || !periods.length) return null;

  const pick = (date: string | undefined) => {
    if (!date) return;
    setPicked(date);
    cells.current.get(date)?.focus();
  };
  const at = (date: string) => days.find(d => d.date === date)?.date;
  const onKey = (e: React.KeyboardEvent) => {
    const i = days.indexOf(sel);
    const to =
      e.key === "ArrowLeft" ? days[i - 1]?.date
      : e.key === "ArrowRight" ? days[i + 1]?.date
      : e.key === "ArrowUp" ? at(addDays(sel.date, -7))
      : e.key === "ArrowDown" ? at(addDays(sel.date, 7))
      : e.key === "Home" ? days[0]?.date
      : e.key === "End" ? latest?.date
      : null;
    if (to === null) return;
    e.preventDefault();
    pick(to);
  };

  const describe = (d: Day) => {
    const n = notable(d);
    if (n.length) return n.map(p => `period ${p.period} ${p.name.toLowerCase()}`).join(", ");
    return marksOf(d).some(p => p.mark === "none") ? "present at every period marked" : "present all day";
  };
  const selMarks = notable(sel);
  const title = `${label} by period`;

  return (
    <Section
      icon={TableView}
      title={title}
      source={source}
      aside={
        share != null && (
          <span className={cn("neo-tabular type-label-sm", toneText[attendanceTone(share)])}>{pctText(share)}% present</span>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line-faint px-3.5 py-2.5">
        {key.map(k => (
          <span key={`${k.mark}:${k.name}`} className="flex items-center gap-1.5 type-caption text-text-2">
            <span data-mark={k.mark} className="neo-st-mark neo-st-key" />
            {markLabel(k.name)}
            <span className="neo-tabular text-text-3">{k.n}</span>
          </span>
        ))}
      </div>

      <div role="group" aria-label={`${title}, a row a week`} onKeyDown={onKey} className="neo-st-grid px-3.5 pt-2.5 pb-3">
        <span />
        {WEEKDAYS.map(w => (
          <span key={w} className="text-center type-caption text-text-3">
            {w}
          </span>
        ))}
        {weeks.map(w => (
          <Fragment key={w.monday}>
            <span className="neo-tabular pe-1.5 type-caption whitespace-nowrap text-text-3">{shortDate(w.monday)}</span>
            {w.slots.map((d, i) =>
              d ? (
                // eslint-disable-next-line glaze/no-native-control -- a day in the grid, drawn as its periods: a Glaze Button would draw a pill round it
                <button
                  key={d.date}
                  ref={el => {
                    if (el) cells.current.set(d.date, el);
                    else cells.current.delete(d.date);
                  }}
                  type="button"
                  tabIndex={d === sel ? 0 : -1}
                  aria-pressed={d === sel}
                  aria-label={`${longDay(d.date)}: ${describe(d)}`}
                  data-on={d === sel || undefined}
                  onClick={() => setPicked(d.date)}
                  className="neo-st-day"
                >
                  {marksOf(d).map(p => (
                    <span key={p.period} data-mark={p.mark} className="neo-st-mark neo-st-cell" />
                  ))}
                </button>
              ) : (
                <span key={`${w.monday}-${i}`} />
              ),
            )}
          </Fragment>
        ))}
      </div>

      <div className="border-t border-line-faint px-3.5 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate type-label text-text-1">{longDay(sel.date)}</span>
          {selMarks.length === 0 && (
            <span className="shrink-0 type-label-sm text-ok-text">
              {marksOf(sel).some(p => p.mark === "none") ? "Present every period marked" : "Present all day"}
            </span>
          )}
        </div>
        {selMarks.map(p => (
          <p key={p.period} className="mt-1 flex items-center gap-2 type-label-sm">
            <span data-mark={p.mark} className="neo-st-mark neo-st-key" />
            <span className="shrink-0 text-text-1">Period {p.period}</span>
            {p.class && <span className="shrink-0 text-text-1">{p.class}</span>}
            <span className="min-w-0 truncate text-text-2">
              {p.name}
              {p.reason && <span className="text-text-3"> · {p.reason}</span>}
            </span>
          </p>
        ))}
      </div>
    </Section>
  );
}

// ---------- absences (Compass's rolls) ----------

type Absence = NonNullable<CompassAttendance["absences"]>[number];

/** Each day off or late in the span: when, why (Compass's reason), and which classes it took. */
function Absences({ items }: { items: Absence[] }) {
  // Classes missed first; clubs and events (a roll with no period: Robotics Club, a workshop) fold away on their own.
  const lessons = items.filter(a => a.classes.some(c => c.period != null));
  const extras = items.filter(a => !a.classes.some(c => c.period != null));
  const head = lessons.slice(0, 8);
  const rest = lessons.slice(8);
  const row = (a: Absence) => {
    const mark = markOf(a.code, a.name);
    const classes = a.classes.map(c => (c.period != null ? `P${c.period} ${c.class}` : c.class)).join(" · ");
    return (
      <Row key={`${a.date}|${a.code}|${a.reason ?? ""}`}>
        <div className="flex items-center gap-3">
          <span data-mark={mark} className="neo-st-mark neo-st-key" />
          <span className="w-20 shrink-0 neo-tabular type-label-sm text-text-2">
            {WEEKDAYS[weekdayIndex(a.date)] ?? ""} {shortDate(a.date)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate type-label text-text-1">{a.code === "L" ? `Late${a.reason ? ` · ${a.reason.toLowerCase()}` : ""}` : (a.reason ?? markLabel(a.name))}</span>
            <span className="block truncate type-caption text-text-3">{classes}</span>
          </span>
          {a.classes.length > 1 && <span className="neo-tabular shrink-0 type-caption text-text-3">{a.classes.length}</span>}
        </div>
      </Row>
    );
  };
  return (
    <Section icon={Warning} title="Absences and lates" source="compass">
      {head.map(row)}
      {rest.length > 0 && (
        <FoldMore label="Earlier" count={rest.length}>
          {rest.map(row)}
        </FoldMore>
      )}
      {extras.length > 0 && (
        <FoldMore label="Clubs and events" count={extras.length}>
          {extras.map(row)}
        </FoldMore>
      )}
    </Section>
  );
}
