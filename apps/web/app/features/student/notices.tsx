import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/glaze/ui/segmented-control";
import { EventAssembly, Notice as NoticeGlyph, Time } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { clock, dayIn, dayName } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";
import { assemblyTime, upcomingAssemblies, type Announcements, type Notice, type UpcomingAssembly } from "@/lib/neo/announcements";
import { Linked, PlanText } from "@/features/class/sections";
import { FileRow, fileKind, hostOf, linkKind } from "@/features/class/kit";
import { FoldSection, Section } from "./parts";

/**
 * The school's notices, in the side panel (convex/announcements.ts), opened from the row under the classes on home:
 * the assemblies coming up that are for the student first, then the latest day's notices, each as Claude summed it up
 * (or as it was written, a switch away, and until it has been read), with its files, and older days folded under
 * Earlier.
 */
export function NoticesPage({ data, today, zone, now }: { data: Announcements; today: string; zone: string; now: number }) {
  const assemblies = upcomingAssemblies(data, today, now);
  const days = byDay(data.notices, zone);
  const [latest, ...older] = days;
  return (
    <>
      {assemblies.length > 0 && (
        <Section icon={EventAssembly} title="Assemblies coming up" source="compass">
          {assemblies.map((a, i) => (
            <AssemblyRow key={`${a.date}:${a.id}`} a={a} today={today} zone={zone} top={i > 0} />
          ))}
        </Section>
      )}
      {latest && (
        <Section icon={NoticeGlyph} title={dayName(latest.day, today)} source="compass">
          {latest.notices.map((n, i) => (
            <NoticeItem key={n.id} notice={n} today={today} zone={zone} top={i > 0} />
          ))}
        </Section>
      )}
      {older.length > 0 && (
        <FoldSection icon={Time} title="Earlier" count={older.reduce((n, d) => n + d.notices.length, 0)}>
          {older.map((d, i) => (
            <section key={d.day} aria-label={dayName(d.day, today)} className={cn(i > 0 && "border-t border-line-faint")}>
              <h4 className="px-3.5 pt-2.5 type-label-sm text-text-2">{dayName(d.day, today)}</h4>
              {d.notices.map((n, j) => (
                <NoticeItem key={n.id} notice={n} today={today} zone={zone} top={j > 0} nested />
              ))}
            </section>
          ))}
        </FoldSection>
      )}
    </>
  );
}

/** Notices by the school day they were posted, newest day first (they come newest first). */
function byDay(notices: Notice[], zone: string) {
  const days: Array<{ day: string; notices: Notice[] }> = [];
  for (const n of notices) {
    const day = dayIn(zone, n.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.notices.push(n);
    else days.push({ day, notices: [n] });
  }
  return days;
}

/** An assembly coming up that is for the student: what, where, who for, which day and when. */
function AssemblyRow({ a, today, zone, top }: { a: UpcomingAssembly; today: string; zone: string; top: boolean }) {
  return (
    <div className={cn("flex min-h-13 items-center gap-3 px-3.5 py-2", top && "border-t border-line-faint")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate type-label", a.maybe ? "text-text-2" : "text-text-1")}>{a.title}</span>
        <span className="truncate type-caption text-text-3">{[a.place, a.audience, a.maybe ? "May not include you" : null].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="type-label-sm text-text-1">{dayName(a.date, today)}</span>
        <span className="neo-tabular type-caption text-text-3">{assemblyTime(a, zone)}</span>
      </span>
    </div>
  );
}

/**
 * One notice: its title, who posted it and when, then either Claude's reading of it (its summary and bullet points) or
 * the notice as it was written, never both at once. A notice Claude has read opens on the summary, with a switch to the
 * original in its place; one not read (yet, or at all) is only the original. The original is drawn from its own
 * paragraphs, lists, bold and links (lib/plan.ts on the server; never its HTML), faded under "Show all" when long. Its
 * files follow either way, each opening in the viewer as a class's do.
 */
function NoticeItem({ notice: n, today, zone, top, nested }: { notice: Notice; today: string; zone: string; top?: boolean; nested?: boolean }) {
  const [view, setView] = useState<"summary" | "original">("summary");
  // Under Earlier, a notice's title sits under its day's heading.
  const Title = nested ? "h5" : "h4";
  const posted = dayIn(zone, n.at);
  const when = posted === today ? clock(n.at, zone) : dayName(posted, today);
  const bullets = n.bullets?.length ? n.bullets : null;
  const read = !!(bullets || n.summary);
  const original = !!(n.blocks?.length || n.text);
  const showing = read ? view : "original";
  return (
    <article className={cn("px-3.5 py-3", top && "border-t border-line-faint")}>
      <div className="flex items-baseline gap-3">
        <Title className="min-w-0 flex-1 type-label text-text-1">
          {n.important && <span className="neo-important me-1.5">Important</span>}
          {n.title}
        </Title>
        <span className="neo-tabular shrink-0 type-caption text-text-3">{when}</span>
      </div>
      {n.by && <p className="type-caption text-text-3">{n.by}</p>}

      {read && original && (
        <SegmentedControl size="sm" aria-label={`Show ${n.title} as`} value={view} onValueChange={v => setView(v === "original" ? "original" : "summary")} className="mt-2">
          <SegmentedControlItem value="summary">Summary</SegmentedControlItem>
          <SegmentedControlItem value="original">Original</SegmentedControlItem>
        </SegmentedControl>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={showing} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={spring.focus}>
          {showing === "summary" ? (
            <>
              {n.summary && <p className="mt-2 type-body-sm text-text-1">{n.summary}</p>}
              {bullets && (
                <ul className="neo-bullets mt-1.5 type-body-sm text-text-2">
                  {bullets.map((b, i) => (
                    <li key={i}>
                      <Linked text={b} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 type-caption text-text-3">Summarised by Claude</p>
            </>
          ) : (
            <>
              {n.status === "pending" && <p className="mt-1.5 type-caption text-text-3">Claude is summing this up…</p>}
              {original && <Original notice={n} />}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {n.attachments.length > 0 && (
        <div className="mt-2">
          {n.attachments.map((f, i) => {
            const kind = f.external ? linkKind(f.href) : fileKind(f.name);
            return (
              <FileRow
                key={`${f.name}-${i}`}
                name={f.name}
                href={f.href}
                external={f.external}
                source="compass"
                kind={kind}
                meta={f.href ? (f.external ? (hostOf(f.href) ?? kind.label) : kind.label) : "Only on Compass"}
                className="border-t border-line-faint py-2"
              />
            );
          })}
        </div>
      )}
    </article>
  );
}

/** A notice this long (in characters, or paragraphs and items) is faded out under "Show all" until asked for. */
const LONG_CHARS = 700;
const LONG_BLOCKS = 9;

/** The notice as it was written: its own blocks where kept, else its plain words, line by line. */
function Original({ notice: n }: { notice: Notice }) {
  const [whole, setWhole] = useState(false);
  const blocks = n.blocks?.length ? n.blocks : null;
  const long = n.text.length > LONG_CHARS || (blocks ? blocks.length > LONG_BLOCKS : n.text.split("\n").length > LONG_BLOCKS);
  const clipped = long && !whole;
  return (
    <div className="mt-2">
      <div className={cn(clipped && "neo-fade-clip")}>
        {blocks ? (
          <PlanText blocks={blocks} />
        ) : (
          <p className="neo-pre-line type-body-sm text-text-2">
            <Linked text={n.text} />
          </p>
        )}
      </div>
      {long && (
        <Button variant="ghost" size="sm" className="-ms-2.5 mt-0.5" aria-expanded={whole} onClick={() => setWhole(w => !w)}>
          {whole ? "Show less" : "Show all"}
        </Button>
      )}
    </div>
  );
}
