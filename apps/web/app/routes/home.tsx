import { useEffect, useRef, useState } from "react";
import { Navigate, PrefetchPageLinks, useNavigate } from "react-router";
import { useAction } from "convex/react";
import { LayoutGroup, motion, type PanInfo } from "motion/react";
import { api } from "@compassneo/backend/api";
import type { Route } from "./+types/home";
import { signOutNotice, useSession, useSignOut } from "@/lib/neo/session";
import { NeoMark } from "@/components/brand/logo";
import { Button } from "@/components/glaze/ui/button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/glaze/ui/alert";
import { morphRoute } from "@/lib/neo/morph";
import { useArrival } from "@/lib/neo/arrive";
import { cn } from "@/lib/glaze/utils";
import { addDays, dayIn, daysApart, zoneOf } from "@/lib/neo/days";
import { keysOf, useDay } from "@/lib/neo/timetable";
import { useNow } from "@/lib/neo/time";
import { SyncButton } from "@/features/sync/sync-button";
import { Profile } from "@/features/home/profile";
import { DayView } from "@/features/timetable/day-view";
import { DayPicker } from "@/features/timetable/day-picker";
import { ClassPanel, ClassPrefetch, PlanPrefetch, type Picked } from "@/features/class/class-panel";
import { ActivePanel, dayRoom, usePanelLayout } from "@/features/panel/side-panel";
import { StudentPanel, type StudentPage } from "@/features/student/student-panel";
import { StudentShortcuts } from "@/features/student/shortcuts";
import { ClassList } from "@/features/home/class-list";
import { lessonOfClass, type ListedClass } from "@/lib/neo/classlist";
import { FileViewer } from "@/features/viewer/file-viewer";
import { spring } from "@/lib/neo/motion";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Compass Neo" }];
}

/** How far a swipe has to travel, or how fast, to turn the day. */
const SWIPE_PX = 70;
const SWIPE_SPEED = 500;

/**
 * Where a signed-in person lands: the day's classes, biggest first, under the mark, the sync gauge and their photo.
 * The dock at the foot moves a day either way and back to today; so do a swipe, the arrow keys and T. A class opens
 * in the panel at the side (features/class): on a wide screen the day moves aside for it, on a phone it covers the
 * screen. It stays open while the days turn; pressing the same class again, Escape or its close button shuts it.
 */
export default function Home() {
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const syncNow = useAction(api.sync.now);
  const token = session.token;
  const me = session.me;
  const arrival = useArrival();

  const zone = zoneOf(me?.slug ?? "");
  const now = useNow(15_000);
  const today = dayIn(zone, now);
  // null follows today (past midnight too); a day picked stays picked.
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const [dir, setDir] = useState(0);
  const [openClass, setOpenClass] = useState<Picked | null>(null);
  // The class panel asks for more room for a section that wants it (resources); see dayRoom.
  const [expanded, setExpanded] = useState(false);
  // One of the student's own pages (attendance, events, Chronicle), in the same place as a class. One panel at a time.
  const [page, setPage] = useState<StudentPage | null>(null);
  const openedFrom = useRef<HTMLElement | null>(null);
  const layout = usePanelLayout();

  const shown = useDay(token, day);
  // The days either side are fetched too, so turning to them is instant.
  useDay(token, addDays(day, -1));
  useDay(token, addDays(day, 1));

  const goTo = (next: string) => {
    if (next === day) return;
    setDir(Math.sign(daysApart(day, next)));
    setPicked(next === today ? null : next);
  };
  const move = (by: -1 | 1) => goTo(addDays(day, by));
  const toToday = () => goTo(today);

  const lessons = shown.day?.lessons ?? [];
  const keys = keysOf(lessons, day);
  // The open class's lesson on the day shown: the one it was opened from, else its first lesson that day.
  const lessonOnDay = openClass ? (lessons[keys.indexOf(openClass.key)] ?? lessons.find(l => l.code === openClass.code) ?? null) : null;

  const close = () => {
    setOpenClass(null);
    setExpanded(false);
    setPage(null);
    requestAnimationFrame(() => openedFrom.current?.focus({ preventScroll: true }));
  };
  const open = (k: string, el: HTMLElement) => {
    const lesson = lessons[keys.indexOf(k)];
    if (!lesson) return;
    // The class already open, pressed again, puts the panel away.
    if (openClass?.code === lesson.code && openClass.key === k) return close();
    openedFrom.current = el;
    setPage(null);
    setOpenClass({ code: lesson.code, key: k, lesson });
  };
  // A class from the list under the day: it opens even when it is not on the day shown (then the panel leads with its
  // next lesson). Pressing the open one again puts the panel away.
  const openListed = (c: ListedClass, el: HTMLElement) => {
    if (openClass?.code === c.code) return close();
    openedFrom.current = el;
    setPage(null);
    setOpenClass({ code: c.code, key: `list:${c.code}`, lesson: lessonOfClass(c, now) });
  };
  const openPage = (p: StudentPage) => {
    if (page === p) return close();
    openedFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenClass(null);
    setExpanded(false);
    setPage(p);
  };
  const panelOpen = !!openClass || !!page;

  // Opening the app syncs, unless the last sync is under twenty minutes old (a sign-in has just done one). If Compass
  // has ended the session, the server signs in again with the stored login; if that login no longer works, the
  // account is forgotten and this device lands on sign-in with the reason.
  useEffect(() => {
    if (!token) return;
    void syncNow({ token })
      .then(r => {
        if (!r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
      })
      .catch(() => {});
  }, [token, syncNow]);

  // The arrow keys turn the day, T goes back to today, Escape closes the class panel. With the panel beside the day
  // (a wide screen) the keys still turn the day, unless the panel has focus; on a phone it covers the day, so they wait.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && panelOpen) return close();
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable], [role=radiogroup], [role=tablist], [data-class-panel]")) return;
      if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "t" || e.key === "T") toToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On a phone the page holds still under the panel; beside the day, both scroll on their own.
  const covering = panelOpen && !layout.wide;
  useEffect(() => {
    if (!covering) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [covering]);

  if (session.status === "signed-out" || !me || !token) return <Navigate to="/login" replace />;

  // Back to sign-in: the mark flies back to the login's dial while the app goes out of focus. The session is cleared
  // once the login screen is up, so nothing flashes in between.
  const leave = async (to = "/login") => {
    await morphRoute(() => navigate(to, { replace: true, flushSync: true, state: { signedOut: true } }), "login");
    await signOut();
  };
  const signInAgain = () => leave(`/login/${me.slug}`);

  const swiped = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX || info.velocity.x < -SWIPE_SPEED) move(1);
    else if (info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_SPEED) move(-1);
  };

  return (
    <div data-route="home" className="min-h-dvh bg-page">
      {/* The login route's code is fetched ahead, so signing out morphs without waiting on the network. */}
      <PrefetchPageLinks page="/login" />
      <LayoutGroup>
        {/* On a wide screen the day moves aside for the class panel: the page's right padding springs to the panel's
            width as it slides in, on the same spring, so the day stays centred in what is left. */}
        <motion.div initial={false} animate={{ paddingRight: dayRoom(layout, panelOpen, !!openClass && expanded) }} transition={spring.panel}>
          <header className="neo-topbar sticky top-0 z-20">
            <div className="neo-column mx-auto flex w-full items-center gap-2 px-4 neo-safe-top pb-3">
              {/* eslint-disable-next-line glaze/no-native-control -- a picture that is its own button: a Glaze Button would draw a pill around the mark or the photo */}
              <button type="button" aria-label="Compass Neo, go to today" onClick={toToday} className="rounded-pill focus-visible:focus-ring">
                <NeoMark size={26} className="neo-vt-mark" />
              </button>
              <div className="ms-auto flex items-center gap-1.5">
                <SyncButton token={token} />
                <Profile me={me} token={token} onSignOut={() => void leave()} />
              </div>
            </div>
          </header>

          <main onAnimationEnd={arrival.onAnimationEnd} className={cn("neo-column mx-auto w-full px-4 pb-16", arrival.className)}>
            {me.needsSignIn && !me.connect && (
              <Alert status="neutral" announce={false} className="mb-4">
                <AlertTitle>Sign in once more to stay signed in</AlertTitle>
                <AlertDescription>This device signed in before Compass Neo kept logins, so Compass will sign it out within a day.</AlertDescription>
                <AlertAction>
                  <Button size="sm" variant="secondary" onClick={signInAgain}>
                    Sign in again
                  </Button>
                </AlertAction>
              </Alert>
            )}

            <h1 className="sr-only">Your classes</h1>
            <motion.div
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.22}
              onDragEnd={swiped}
              className="touch-pan-y"
            >
              <DayView
                day={shown.day}
                loading={shown.loading}
                dayKey={day}
                now={now}
                isToday={day === today}
                zone={zone}
                dir={dir}
                selected={openClass?.code ?? null}
                onOpen={open}
                onNextDay={() => move(1)}
              />
            </motion.div>
            <DayPicker day={day} today={today} dir={dir} onMove={move} onToday={toToday} />
            <ClassList token={token} day={day} today={today} zone={zone} now={now} selected={openClass?.code ?? null} onOpen={openListed} />
            <StudentShortcuts token={token} open={page} onOpen={openPage} />

          </main>
        </motion.div>

        <ActivePanel.Provider value={openClass ? "class-panel" : page ? "student-panel" : null}>
        <ClassPanel
          picked={openClass}
          lessonOnDay={lessonOnDay}
          token={token}
          day={day}
          today={today}
          now={now}
          zone={zone}
          isToday={day === today}
          connect={me.connect}
          layout={layout}
          expanded={expanded}
          onExpand={setExpanded}
          onClose={close}
        />
        <StudentPanel page={page} token={token} zone={zone} now={now} today={today} layout={layout} onClose={close} />
        </ActivePanel.Provider>
        {/* Files and videos from either panel open over the app, never in another tab. */}
        <FileViewer />
        {/* Every class on the day is fetched ahead, so its panel opens with everything in it. */}
        {[...new Set(lessons.map(l => l.code))].map(code => (
          <ClassPrefetch key={code} token={token} code={code} day={day} />
        ))}
        <PlanPrefetch token={token} ids={lessons.map(l => l.id)} />
      </LayoutGroup>
    </div>
  );
}
