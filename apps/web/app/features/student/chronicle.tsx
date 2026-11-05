import { Avatar } from "@/components/glaze/ui/avatar";
import { Linked } from "@/features/class/sections";
import {
  Chronicle as ChronicleGlyph,
  Commendation,
  Failed,
  Grade,
  HousePoints,
  Icon,
  Information,
  LetterHome,
  Locked,
  Notice as NoticeGlyph,
  Time,
  Warning,
  type GlazeIcon,
} from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { dayIn } from "@/lib/neo/days";
import type { Chronicle, ChronicleEntry, Events } from "@/lib/neo/student";
import { plural } from "./format";
import { KIND, kindOf, norm, type EventKind } from "./kinds";
import { FoldSection, GrowRow, Notice } from "./parts";
import { categoryOf, eventOf, isCommendation, isNotice, noteOf, noticeName, valuesOf } from "./record";

/** What Compass counts in each category, beside what the student can open of it. */
export function chronicleCounts(data: Chronicle) {
  const categories = data.summary.map(s => {
    const visible = data.entries.filter(e => e.category === s.category).length;
    return { ...s, hidden: Math.max(0, s.count - visible) };
  });
  return { categories, hidden: categories.reduce((a, c) => a + c.hidden, 0) };
}

/** What a run of entries adds up to: house points, commendations, events gone to, attendance notices. */
export function recordOf(entries: ChronicleEntry[]) {
  return {
    points: entries.reduce((a, x) => a + x.points, 0),
    commendations: entries.filter(isCommendation).length,
    events: entries.filter(x => eventOf(x)).length,
    notices: entries.filter(isNotice).length,
  };
}

const monthName = new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" });
const weekdayDay = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
const atNoon = (day: string) => Date.parse(`${day}T12:00:00Z`);

/**
 * Chronicle in the day list's manner: a line of what the year adds up to, then every entry by month, each month one
 * block of rows split by hairlines. A row is its glyph (green when it is good news), its title (the event's name for
 * an event the student went to), one line under it (the staff member's note, else where or what), and the date and
 * any points on the right; it opens to its fields. Attendance notices are one quiet row a month. Earlier years fold.
 */
export function ChroniclePage({ data, events, zone, today }: { data: Chronicle; events?: Events | null; zone: string; today: string }) {
  const { entries } = data;
  const { categories, hidden } = chronicleCounts(data);

  if (!entries.length) {
    const withHidden = categories.filter(c => c.hidden > 0);
    return hidden > 0 ? (
      <Notice
        icon={Locked}
        title="Nothing here you can open"
        body={
          withHidden.length === 1
            ? `Compass counts ${plural(hidden, "entry", "entries")} in ${withHidden[0]!.category} that it doesn't show students.`
            : `Compass counts ${plural(hidden, "entry", "entries")} across ${withHidden.length} categories that it doesn't show students.`
        }
      />
    ) : (
      <Notice icon={ChronicleGlyph} title="Nothing from staff yet" body="House points, commendations and the events you go to show here as staff add them." />
    );
  }

  const year = today.slice(0, 4);
  const dayOf = (e: ChronicleEntry) => (e.at ? dayIn(zone, e.at) : null);
  const thisYear = entries.filter(e => dayOf(e)?.startsWith(year));
  const summary = recordOf(thisYear.length ? thisYear : entries);

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
  const month = (k: string) => (
    <Month key={k} label={k === "undated" ? "Undated" : monthName.format(atNoon(`${k}-01`))} {...months.get(k)!} kinds={kinds} zone={zone} />
  );

  const parts = (
    [
      [summary.points, Math.abs(summary.points) === 1 ? "house point" : "house points"],
      [summary.commendations, summary.commendations === 1 ? "commendation" : "commendations"],
      [summary.events, summary.events === 1 ? "event" : "events"],
    ] as Array<[number, string]>
  ).filter(([n]) => n !== 0);

  return (
    <>
      {parts.length > 0 && (
        <p className="neo-tabular px-1 type-body-sm text-text-2">
          {parts.map(([n, label], i) => (
            <span key={label}>
              {i > 0 && " · "}
              <span className="font-medium text-text-1">{n}</span> {label}
            </span>
          ))}
          {thisYear.length ? " this year" : ""}
        </p>
      )}

      {recent.length > 0 && <div className="flex flex-col gap-4">{recent.map(month)}</div>}

      {years.map(y => {
        const ks = keys.filter(k => k.startsWith(y));
        const n = ks.reduce((a, k) => a + months.get(k)!.items.length, 0);
        return (
          <FoldSection key={y} icon={Time} title={y} count={plural(n, "entry", "entries")} defaultOpen={recent.length === 0 && y === years[0]} bare>
            <div className="flex flex-col gap-4">{ks.map(month)}</div>
          </FoldSection>
        );
      })}

      {hidden > 0 && (
        <p className="flex items-center gap-2 px-1 type-caption text-text-3">
          <Icon icon={Locked} size={12} />
          Compass also counts {plural(hidden, "entry", "entries")} that students can&rsquo;t open.
        </p>
      )}
    </>
  );
}

/** One month: its name, then one block of its entries, its attendance notices last as a single quiet row. */
function Month({
  label,
  items,
  notices,
  kinds,
  zone,
}: {
  label: string;
  items: ChronicleEntry[];
  notices: ChronicleEntry[];
  kinds: Map<string, EventKind>;
  zone: string;
}) {
  return (
    <section aria-label={label}>
      <h3 className="mb-1.5 ps-1 type-label-sm text-text-2">{label}</h3>
      <div className="neo-stack neo-notice">
        {items.map(e => (
          <Entry key={e.id} e={e} kinds={kinds} zone={zone} />
        ))}
        {notices.length > 0 && <Notices notices={notices} zone={zone} />}
      </div>
    </section>
  );
}

const dayLabel = (e: ChronicleEntry, zone: string) => (e.at ? weekdayDay.format(atNoon(dayIn(zone, e.at))) : null);

/** The glyph a row leads with: green only for good news; an event's own kind; otherwise quiet. */
function glyphOf(e: ChronicleEntry, kinds: Map<string, EventKind>): { icon: GlazeIcon; className: string; label: string } {
  const ev = eventOf(e);
  if (ev) {
    const k = KIND[kinds.get(norm(ev.name)) ?? kindOf({ kind: "event", title: ev.name, place: ev.place, sessions: [] })];
    return { icon: k.icon, className: "text-text-3", label: k.label };
  }
  if (e.rating === "positive") {
    const icon = isCommendation(e) ? Grade : e.points > 0 ? HousePoints : Commendation;
    return { icon, className: "text-ok-text", label: "Positive" };
  }
  if (e.rating === "caution") return { icon: Warning, className: "text-warn-text", label: "Caution" };
  if (e.rating === "concern") return { icon: Failed, className: "text-fail-text", label: "Concern" };
  return { icon: /letter/i.test(e.category ?? "") ? LetterHome : Information, className: "text-text-3", label: "Note" };
}

function Entry({ e, kinds, zone }: { e: ChronicleEntry; kinds: Map<string, EventKind>; zone: string }) {
  const ev = eventOf(e);
  const g = glyphOf(e, kinds);
  const note = ev ? null : noteOf(e);
  const preview = ev
    ? [ev.place, ev.time, ev.sessions > 1 ? `${ev.sessions} sessions` : null].filter(Boolean).join(" · ")
    : (note ?? [categoryOf(e), e.by].filter(Boolean).join(" · "));

  // Opened, it reads as the note itself: the teacher's words, the short answers in one quiet line, then who and when.
  // Nothing the row already says, none of Compass's template prompts. An entry with no fields has nothing to open.
  const line = ev
    ? [[ev.date, ev.time].filter(Boolean).join(", "), ev.place, ev.sessions > 1 ? `${ev.sessions} sessions` : null]
    : valuesOf(e);
  const more = e.fields.some(f => f.value.trim()) ? (
    <div className="pt-0.5">
      {note && <p className="neo-st-pre type-body-sm text-text-1"><Linked text={note} /></p>}
      {line.filter(Boolean).length > 0 && <p className="neo-tabular mt-0.5 type-caption text-text-2">{line.filter(Boolean).join(" · ")}</p>}
      {(e.by || (e.at && !ev)) && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 type-caption text-text-3">
          {e.by && <Avatar name={e.by} src={e.byPhotoUrl ?? undefined} size="sm" decorative />}
          {/* An event's line already has its day. */}
          <span className="min-w-0 truncate">{[e.by, e.at && !ev ? fullDay.format(atNoon(dayIn(zone, e.at))).replace(",", "") : null].filter(Boolean).join(" · ")}</span>
        </p>
      )}
    </div>
  ) : undefined;

  return (
    <GrowRow
      lead={<Icon icon={g.icon} size={16} label={g.label} className={cn("mt-0.5", g.className)} />}
      title={ev ? ev.name : e.title}
      preview={preview}
      more={more}
      aside={
        <div className="flex shrink-0 flex-col items-end">
          <span className="neo-tabular type-label-sm text-text-2">{dayLabel(e, zone)}</span>
          {e.points !== 0 && (
            <span className={cn("neo-tabular type-caption", e.points > 0 ? "text-ok-text" : "text-fail-text")}>
              {e.points > 0 ? "+" : ""}
              {e.points}
            </span>
          )}
        </div>
      }
    />
  );
}

/** A month's attendance notices, as one quiet row that grows to list them. */
function Notices({ notices, zone }: { notices: ChronicleEntry[]; zone: string }) {
  const names = [...new Set(notices.map(noticeName))];
  return (
    <GrowRow
      dim
      lead={<Icon icon={NoticeGlyph} size={16} className="mt-0.5 text-text-3" />}
      title={plural(notices.length, "attendance notice")}
      preview={names.join(", ")}
      more={
        <div className="flex flex-col gap-0.5 pt-0.5">
          {notices.map(n => (
            <p key={n.id} className="flex gap-3 type-body-sm text-text-2">
              <span className="neo-tabular w-14 shrink-0 text-text-3">{dayLabel(n, zone)}</span>
              <span className="min-w-0">{noticeName(n)}</span>
            </p>
          ))}
        </div>
      }
    />
  );
}
