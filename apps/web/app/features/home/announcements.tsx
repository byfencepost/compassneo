import { ChevronRight, EventAssembly, Icon, Notice as NoticeGlyph } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { dayIn, dayName } from "@/lib/neo/days";
import { assemblyTime, upcomingAssemblies, useAnnouncements, type Notice } from "@/lib/neo/announcements";
import { pageHue } from "@/features/student/meta";

/**
 * The school's notices on home, under the classes: one row, never the notices themselves. It says what the latest
 * day's notices come to, in Claude's summary (or that Claude is still reading them, or their titles when it could
 * not), and the next assembly that is for the student. Pressing it opens the notices in the side panel
 * (features/student/notices.tsx), where everything else is. Hidden when there is nothing to show.
 */
export function Announcements({
  token,
  today,
  zone,
  now,
  open,
  onOpen,
}: {
  token: string;
  today: string;
  zone: string;
  now: number;
  /** The notices are open in the panel. */
  open: boolean;
  onOpen: () => void;
}) {
  const data = useAnnouncements(token);
  if (!data) return null;
  const next = upcomingAssemblies(data, today, now)[0];
  const latestDay = data.notices[0] ? dayIn(zone, data.notices[0].at) : null;
  const latest = latestDay ? data.notices.filter(n => dayIn(zone, n.at) === latestDay) : [];
  if (!latest.length && !next) return null;

  return (
    <section aria-label="Notices" className="mt-6">
      <div className="neo-stack neo-notice">
        {/* eslint-disable-next-line glaze/no-native-control -- a whole block that opens the notices: a Glaze Button would draw a pill inside the card */}
        <button
          type="button"
          aria-pressed={open}
          data-on={open || undefined}
          data-hue={pageHue("notices", null)}
          onClick={onOpen}
          className="neo-row-button flex w-full items-start gap-3 px-3.5 py-3 text-start"
        >
          <Icon icon={NoticeGlyph} size={16} className="neo-glyph mt-0.5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="type-label text-text-1">Notices</span>
              {latestDay && <span className="truncate type-caption text-text-3">{dayName(latestDay, today)}</span>}
            </span>
            {latest.length > 0 && <span className="neo-clamp-2 mt-0.5 type-body-sm text-text-2">{gist(latest)}</span>}
            {next && (
              <span className="mt-1.5 flex min-w-0 items-center gap-1.5 type-caption">
                <Icon icon={EventAssembly} size={12} className="neo-assembly-glyph shrink-0" />
                <span className={cn("truncate", next.maybe ? "text-text-2" : "text-text-1")}>
                  {next.title} · {dayName(next.date, today)} {assemblyTime(next, zone)}
                </span>
              </span>
            )}
          </span>
          <Icon icon={ChevronRight} size={16} className="mt-0.5 shrink-0 text-text-3" />
        </button>
      </div>
    </section>
  );
}

/**
 * What a day's notices come to, in a line or two: Claude's summary of the first it has read (a day usually has one
 * bulletin), and how many more there are; while Claude is still reading, that; else the titles.
 */
function gist(notices: Notice[]) {
  const read = notices.find(n => n.summary);
  const more = notices.length - 1;
  if (read) return more > 0 ? `${read.summary} (+${more} more)` : read.summary;
  if (notices.some(n => n.status === "pending")) return "Claude is summing up the notices…";
  return notices.map(n => n.title).join(" · ");
}
