import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { Close, Icon, Pending, Sync } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { spring } from "@/lib/neo/motion";
import { ago } from "@/lib/neo/time";
import { useAttendance, useChronicle, useEvents } from "@/lib/neo/student";
import { SidePanel, type PanelLayout } from "@/features/panel/side-panel";
import { AttendancePage } from "./attendance";
import { ChroniclePage } from "./chronicle";
import { EventsPage } from "./events";
import { PAGES, pageHue, type StudentPage } from "./meta";
import { Notice, SkeletonSection } from "./parts";

export type { StudentPage } from "./meta";

type Props = {
  page: StudentPage | null;
  token: string;
  zone: string;
  now: number;
  today: string;
  layout: PanelLayout;
  onClose: () => void;
};

/**
 * The student's own pages in the side panel, the same panel a class opens in (one at a time): Attendance, Events and
 * Chronicle. Each has a header like a class's (its glyph and name over a wash of its colour, when it was last
 * fetched, refresh and close) and one scroll of labelled sections, each shown only when it has something. Another
 * page opened while one is up comes into focus in its place.
 */
export function StudentPanel(props: Props) {
  const { page, token, layout, onClose } = props;
  const attendance = useAttendance(token);
  const events = useEvents(token);
  const chronicle = useChronicle(token);
  const hue = page ? pageHue(page, attendance.data?.compass?.overall.percent) : undefined;
  return (
    <SidePanel open={!!page} name="student-panel" layout={layout} hue={hue} labelledBy="student-panel-title" onClose={onClose}>
      {page && <Body {...props} page={page} attendance={attendance} events={events} chronicle={chronicle} />}
    </SidePanel>
  );
}

type Queries = {
  attendance: ReturnType<typeof useAttendance>;
  events: ReturnType<typeof useEvents>;
  chronicle: ReturnType<typeof useChronicle>;
};

function Body({ page, zone, now, today, onClose, attendance, events, chronicle }: Props & Queries & { page: StudentPage }) {
  const close = useRef<HTMLButtonElement>(null);
  // Focus lands in the panel when it opens, so a keyboard or screen reader carries on from there.
  useEffect(() => close.current?.focus({ preventScroll: true }), []);

  const p = PAGES[page];
  const q = { attendance, events, chronicle }[page];
  const refresh = () => {
    if (!q.refreshing) void q.refresh();
  };

  const a = attendance.data;
  const fetchedAt =
    page === "attendance"
      ? (a?.compass?.fetchedAt ?? (a?.connect && "fetchedAt" in a.connect ? a.connect.fetchedAt : undefined))
      : page === "events"
        ? events.data?.fetchedAt
        : chronicle.data?.fetchedAt;
  const status = q.refreshing ? "Getting the latest" :fetchedAt ? `Updated ${ago(fetchedAt, now)}` : q.data === null ? "Not synced yet" : "";

  const notYet = (
    <Notice
      icon={p.icon}
      title={`No ${p.what} yet`}
      body="It comes in with the next sync."
      action={
        <Button size="sm" variant="secondary" pending={q.refreshing} onClick={refresh}>
          Get {p.what} now
        </Button>
      }
    />
  );

  const content = (() => {
    switch (page) {
      case "attendance": {
        const d = attendance.data;
        if (d === undefined) return <Loading rows={[[56, 36], [40, 40, 40, 40], [36, 36]]} />;
        if (!d || (!d.compass && !d.connect)) return notYet;
        return <AttendancePage data={d} />;
      }
      case "events": {
        const d = events.data;
        if (d === undefined) return <Loading rows={[[40, 40], [36, 36, 36, 36]]} />;
        if (!d) return notYet;
        return <EventsPage data={d} chronicle={chronicle.data} zone={zone} today={today} now={now} />;
      }
      case "chronicle": {
        const d = chronicle.data;
        if (d === undefined) return <Loading rows={[[40, 40, 40], [36, 36]]} />;
        if (!d) return notYet;
        return <ChroniclePage data={d} events={events.data} zone={zone} today={today} />;
      }
    }
  })();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={page}
        initial={{ opacity: 0, filter: "blur(6px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.1 } }}
        transition={spring.focus}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="neo-st-top relative shrink-0 px-4 pt-4 pb-3.5">
          <div className="flex min-w-0 items-center gap-2.5 pe-20">
            <Icon icon={p.icon} size={20} className="neo-glyph" />
            <h2 id="student-panel-title" className="neo-st-title min-w-0 truncate text-text-1">
              {p.title}
            </h2>
          </div>
          <p className="mt-1 min-h-4 truncate ps-7.5 type-label-sm text-text-2">
            {status}
          </p>
          <div className="absolute end-2.5 top-2.5 flex items-center gap-0.5">
            <Button variant="ghost" size="icon" aria-label={`Refresh ${p.what}`} aria-busy={q.refreshing || undefined} onClick={refresh}>
              {/* While it refreshes, the sync glyph gives way to the pending arc: the glyph's arrowheads wobble when turned. */}
              <Icon icon={q.refreshing ? Pending : Sync} size={16} className={cn(q.refreshing && "animate-spin motion-reduce:animate-none")} />
            </Button>
            <Button ref={close} variant="ghost" size="icon" aria-label={`Close ${p.what}`} onClick={onClose}>
              <Icon icon={Close} size={20} />
            </Button>
          </div>
        </header>

        <div aria-busy={q.data === undefined || undefined} className="neo-st-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-5 px-4 pt-4 pb-10">{content}</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Loading({ rows }: { rows: number[][] }) {
  return rows.map((r, i) => <SkeletonSection key={i} rows={r} />);
}
