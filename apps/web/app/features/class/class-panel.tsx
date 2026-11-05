import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@compassneo/backend/api";
import { Calendar, ChartLine, Close, Icon, LearningTask, Library, Overview } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { useClassDetail } from "@/lib/neo/classes";
import { useClassLearners, type ClassLearners } from "@/lib/neo/learners";
import { useLessonPlans } from "@/lib/neo/plans";
import { spring } from "@/lib/neo/motion";
import type { ClassResources, ResourceNode } from "@/lib/neo/resources";
import type { Lesson } from "@/lib/neo/timetable";
import { useClassWork } from "@/lib/neo/work";
import { RoomTag, SubjectGlyph, TeacherFace } from "@/features/timetable/class-card";
import { FilesPage } from "./files";
import { GradesPage, LessonsPage } from "./pages";
import { ClassmatesBlock, PeoplePage } from "./people";
import { ComingUpBlock, DueBlock, GradeBlock, GradeWaiting, LessonCard, NoticesBlock, PlanBlockCard, SkeletonBlock, type PanelLesson } from "./sections";
import { TabSwitcher, type TabSpec } from "./tab-switcher";
import { ClassAbsencesBlock } from "./absences-block";
import { WorkDetail, WorkPage, useWorkFlows, workItems } from "./work";
import { SidePanel, type PanelLayout } from "@/features/panel/side-panel";

export { usePanelLayout } from "@/features/panel/side-panel";

/** The class picked: its code, and the lesson it was picked from (for its name, colour, glyph and grade while the rest
 * loads). */
export type Picked = { code: string; key: string; lesson: Lesson };

/** Fetches the plans of the day's lessons ahead, so a class opened from the day shows its plan at once. Renders nothing. */
export function PlanPrefetch({ token, ids }: { token: string; ids: string[] }) {
  useLessonPlans(token, ids);
  return null;
}

/**
 * Fetches a class's panel ahead, so opening it finds everything there. Its work and its classmates are read too (what
 * the server already has, without asking Compass or Connect), so the panel's sections are known before it opens and
 * the switcher never gains a tab under the finger. Renders nothing.
 */
export function ClassPrefetch({ token, code, day }: { token: string; code: string; day: string }) {
  useClassDetail(token, code, day);
  useQuery(api.work.forClass, { token, code });
  useQuery(api.learners.forClass, { token, code });
  return null;
}

type Props = {
  picked: Picked | null;
  /** The class's lesson on the day being shown, if it has one. */
  lessonOnDay: Lesson | null;
  token: string;
  day: string;
  today: string;
  now: number;
  zone: string;
  isToday: boolean;
  /** The school has Connect (WA): grades and notices. */
  connect: boolean;
  layout: PanelLayout;
  /** The panel is expanded (a section that wants the room, such as resources); home.tsx makes room for it. */
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  onClose: () => void;
};

/**
 * A class opened from its card, in a panel that floats at the side. On a wide screen it slides in from the right and
 * the day moves aside to make room (home.tsx springs the page's padding on the same spring); on a phone it covers the
 * screen but for a margin, and a swipe to the right puts it away. It stays open while the days turn, showing the same
 * class; picking another class swaps what is in it. Escape, the close button and (on a phone) the swipe close it.
 *
 * The class and its teacher sit at the top, over a switcher of named sections, each its own page with its own scroll,
 * and each only when the class has something for it. The overview answers the plain questions in a card each (when the
 * class is, how the grade is going and its latest marks, what is due, what the teacher posted, the next lessons),
 * every card only when it has an answer; a card's More opens its section: Grades (the graph, where the grade could
 * finish, the semesters, every assessment, the changes), Work (Compass's learning tasks and Connect's submissions, each
 * opening to its whole and to handing work in), Files (both sides' resources as one library; the panel widens for it)
 * and Lessons (the usual week, what is coming, the teachers). Classmates (from Connect) are a card on the overview that
 * opens the whole class. A lesson with a plan in Compass shows it: under the lesson the overview leads with, and in its
 * row on the lists of lessons.
 *
 * Loading never moves anything: home.tsx fetches every class on the day ahead (ClassPrefetch), the top is drawn from
 * the card's own lesson, and the rest holds its shape with skeletons until it lands.
 */
export function ClassPanel(props: Props) {
  const { picked, layout, expanded, onClose } = props;
  return (
    <SidePanel
      open={!!picked}
      name="class-panel"
      layout={layout}
      expanded={expanded}
      hue={picked?.lesson.hue}
      labelledBy="class-panel-title"
      onClose={onClose}
    >
      {picked && <Body {...props} picked={picked} />}
    </SidePanel>
  );
}

type TabId = "overview" | "grades" | "work" | "files" | "lessons";

const TAB: Record<TabId, Omit<TabSpec<TabId>, "id">> = {
  overview: { label: "Overview", icon: Overview },
  grades: { label: "Grades", icon: ChartLine },
  work: { label: "Work", icon: LearningTask },
  files: { label: "Files", icon: Library },
  lessons: { label: "Lessons", icon: Calendar },
};

const hasLeaf = (n: ResourceNode): boolean => n.kind !== "folder" || n.children.some(hasLeaf);

/** The class's resources are in and there is nothing in them (while they load, there may well be). */
function noResources(res: ClassResources | null | undefined) {
  if (!res) return false;
  const sides = [res.compass, res.connect];
  if (sides.some(s => s.status === "missing" || s.status === "unavailable")) return false;
  return !sides.some(s => s.status === "ready" && s.data.some(hasLeaf));
}

const hasPeople = (l: ClassLearners | null | undefined) =>
  !!l && l.learners.status !== "none" && !(l.learners.status === "ready" && !l.learners.data.length);

/** How many of the lessons after the one shown the overview lists. */
const NEXT_LESSONS = 4;

function Body({ picked, lessonOnDay, token, day, today, now, zone, isToday, connect, onExpand, onClose }: Props & { picked: Picked }) {
  const detail = useClassDetail(token, picked.code, day);
  const work = useClassWork(token, picked.code);
  const learners = useClassLearners(token, picked.code);
  // Read only, to know whether there is anything; the Files section fetches them when it opens.
  const resources = useQuery(api.resources.forClass, { token, code: picked.code });
  const flows = useWorkFlows(token, picked.code);
  const loading = detail === undefined;
  const close = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [dir, setDir] = useState(0);
  const [sem, setSem] = useState<number | null>(null);
  /** The piece of work open in the Work section, over its list. */
  const [workKey, setWorkKey] = useState<string | null>(null);
  /** The class list, opened from the overview's classmates card. */
  const [peopleOpen, setPeopleOpen] = useState(false);
  // Where each page was scrolled to, so the list of work comes back where it was left.
  const scrolls = useRef(new Map<string, number>());
  const restore = useRef<string | null>(null);

  // Focus lands in the panel when it opens, so a keyboard or screen reader carries on from there.
  useEffect(() => close.current?.focus({ preventScroll: true }), []);
  // Another class keeps the section that was open (it falls back to the overview when the class has no such section,
  // and comes back to it on the next class that does), at its own semester, with nothing opened inside it.
  useEffect(() => {
    setSem(null);
    setWorkKey(null);
    setPeopleOpen(false);
  }, [picked.code]);

  const l = picked.lesson;
  const name = detail?.name ?? l.name;
  const subject = detail?.subject ?? l.subject;
  const teachers = detail?.teachers.length ? detail.teachers : l.teacher ? [l.teacher] : [];

  // The lesson worth showing: the day's, unless that one is over today, then the next one coming.
  const ahead: PanelLesson[] = (detail?.lessons ?? []).filter(x => Date.parse(x.finish) > now);
  const dayLesson: PanelLesson | null = lessonOnDay && { ...lessonOnDay, day };
  const lesson = dayLesson && !(isToday && Date.parse(dayLesson.finish) <= now) ? dayLesson : (ahead[0] ?? dayLesson);
  const after = lesson ? ahead.filter(x => Date.parse(x.start) > Date.parse(lesson.start)).slice(0, NEXT_LESSONS) : [];
  const room = lessonOnDay ?? (lesson?.room ? { ...l, room: lesson.room, roomWas: lesson.roomWas } : null);

  // Plans for every lesson the panel can show: the one it leads with, the ones to come and the last few.
  const past = (detail?.lessons ?? []).filter(x => Date.parse(x.finish) <= now).slice(-3);
  const plans = useLessonPlans(token, [...(lesson ? [lesson.id] : []), ...ahead.slice(0, 12).map(x => x.id), ...past.map(x => x.id)]);
  const plan = lesson ? plans[lesson.id] : null;

  const grades = detail?.grades;
  const ready = grades?.status === "ready" ? grades : null;
  const current = ready?.current ?? null;
  const other = ready?.other ?? null;
  const main = current ?? other;
  const mainOther = current ? other : null;
  const assessments = [...(current?.tasks ?? []), ...(other?.tasks ?? [])];

  // The sections the class has. Until its detail is in, they are read from the card's lesson, so they do not shuffle.
  const { items: workList } = workItems(work);
  const hasWork = workList.length > 0 || (loading ? l.tasks.length > 0 : !!detail?.tasks.length);
  const has: Record<TabId, boolean> = {
    overview: true,
    grades: loading ? connect && !!l.grade : !!main,
    work: hasWork,
    files: !noResources(resources),
    lessons: loading || !!detail?.lessons.length,
  };
  const tabs = (Object.keys(TAB) as TabId[]).filter(id => has[id]).map(id => ({ id, ...TAB[id] }));
  const shown = tabs.some(t => t.id === tab) ? tab : "overview";
  const go = (id: TabId) => {
    setDir(Math.sign(tabs.findIndex(t => t.id === id) - tabs.findIndex(t => t.id === shown)));
    setTab(id);
    setWorkKey(null);
    setPeopleOpen(false);
  };
  const workItem = shown === "work" && workKey ? (workList.find(w => w.key === workKey) ?? null) : null;
  const openWork = (key: string) => {
    setDir(1);
    setWorkKey(key);
  };
  const backToWork = () => {
    setDir(-1);
    restore.current = "work";
    setWorkKey(null);
  };
  const people = shown === "overview" && peopleOpen && hasPeople(learners);
  const openPeople = () => {
    setDir(1);
    setPeopleOpen(true);
  };
  const backToOverview = () => {
    setDir(-1);
    restore.current = "overview";
    setPeopleOpen(false);
  };
  // Each page of a section has its own key: a list and one thing opened from it slide like two sections.
  const pageKey = workItem ? `work:${workItem.key}` : people ? "overview:people" : shown;

  // Files wants the room: the panel widens while it is open (home.tsx moves the day further aside, or the panel
  // floats over it), and goes back to its usual width for every other section and when it closes.
  useEffect(() => onExpand(shown === "files"), [shown, onExpand]);
  useEffect(() => () => onExpand(false), [onExpand]);

  const page = (() => {
    if (shown === "work")
      return workItem ? (
        <WorkDetail item={workItem} flows={flows} zone={zone} today={today} now={now} onBack={backToWork} assessments={assessments} />
      ) : (
        <WorkPage work={work} flows={flows} zone={zone} today={today} now={now} onOpen={openWork} assessments={assessments} />
      );
    if (shown === "files") return <FilesPage token={token} code={picked.code} title={name} today={today} now={now} />;
    if (people) return <PeoplePage data={learners} onBack={backToOverview} />;
    if (loading || !detail) {
      if (shown !== "overview") return <SkeletonBlock rows={[56, 36, 36, 36]} />;
      return (
        <>
          {lesson && <LessonCard lesson={lesson} next={lesson !== dayLesson} zone={zone} now={now} today={today} />}
          {plan && <PlanBlockCard plan={plan} />}
          {loading ? (
            <>
              <SkeletonBlock rows={[56, 36, 36, 36]} />
              <SkeletonBlock rows={[20, 20]} />
            </>
          ) : (
            <p className="px-1 type-body-sm text-text-2">Compass Neo has nothing more on this class.</p>
          )}
        </>
      );
    }
    switch (shown) {
      case "overview":
        return (
          <>
            {lesson && <LessonCard lesson={lesson} next={lesson !== dayLesson} zone={zone} now={now} today={today} />}
            {plan && <PlanBlockCard plan={plan} />}
            {main ? <GradeBlock g={main} vs={mainOther} now={now} onMore={() => go("grades")} /> : <GradeWaiting grades={detail.grades} />}
            <DueBlock tasks={detail.tasks} zone={zone} today={today} now={now} onMore={has.work ? () => go("work") : undefined} />
            <NoticesBlock notices={detail.notices} zone={zone} today={today} />
            <ClassAbsencesBlock token={token} code={picked.code} />
            <ComingUpBlock lessons={after} zone={zone} today={today} plans={plans} onMore={() => go("lessons")} />
            {hasPeople(learners) && <ClassmatesBlock data={learners} onMore={openPeople} />}
          </>
        );
      case "grades":
        return <GradesPage current={current} other={other} sem={sem} onSem={setSem} since={ready?.historySince ?? null} zone={zone} today={today} now={now} />;
      case "lessons":
        return <LessonsPage detail={detail} plans={plans} zone={zone} today={today} now={now} />;
    }
  })();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={picked.code}
        initial={{ opacity: 0, filter: "blur(6px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.1 } }}
        transition={spring.focus}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="neo-panel-top relative shrink-0 px-4 pt-4.5 pb-4">
          <div className="flex min-w-0 items-center gap-2.5 pe-10">
            <SubjectGlyph lesson={l} size={24} />
            <h2 id="class-panel-title" className="neo-class-hero min-w-0 truncate">
              {name}
            </h2>
            {room && <RoomTag lesson={room} size="lg" />}
          </div>
          {(teachers.length > 0 || subject !== name) && (
            <div className="mt-2.5 flex min-w-0 items-center gap-2">
              {teachers.length > 0 && (
                <span className="flex shrink-0 -space-x-1.5">
                  {teachers.slice(0, 3).map(p => (
                    <TeacherFace key={p.code || p.full || p.name} person={p} className="size-6 ring-2 ring-shell" textClassName="neo-face-text" />
                  ))}
                </span>
              )}
              <p className="min-w-0 truncate type-label-sm text-text-2">
                {teachers.length > 0 && (
                  <span className="text-text-1">
                    {teachers
                      .slice(0, 2)
                      .map(p => p.full ?? p.name)
                      .join(", ")}
                    {teachers.length > 2 && ` +${teachers.length - 2}`}
                  </span>
                )}
                {teachers.length > 0 && subject !== name && " · "}
                {subject !== name && subject}
              </p>
            </div>
          )}
          {tabs.length > 1 && (
            <div className="mt-3.5">
              <TabSwitcher tabs={tabs} value={shown} onChange={go} label="Class sections" panelId="cp-tabpanel" idOf={id => `cp-tab-${id}`} />
            </div>
          )}
          <Button ref={close} variant="ghost" size="icon" aria-label="Close class" onClick={onClose} className="absolute end-2.5 top-2.5">
            <Icon icon={Close} size={20} />
          </Button>
        </header>

        {/* Each section is its own page with its own scroll; the next one slides in from the side it is on. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={pageKey}
              ref={el => {
                if (el && restore.current === pageKey) {
                  el.scrollTop = scrolls.current.get(pageKey) ?? 0;
                  restore.current = null;
                }
              }}
              onScroll={e => scrolls.current.set(pageKey, e.currentTarget.scrollTop)}
              id="cp-tabpanel"
              role={tabs.length > 1 ? "tabpanel" : undefined}
              aria-labelledby={tabs.length > 1 ? `cp-tab-${shown}` : undefined}
              aria-busy={loading || undefined}
              custom={dir}
              variants={turn}
              initial="from"
              animate="at"
              exit="gone"
              transition={spring.morph}
              className="neo-panel-scroll absolute inset-0 overflow-y-auto overscroll-contain"
            >
              <div className="flex flex-col gap-5 px-4 pt-4 pb-10">{page}</div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const turn = {
  from: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  at: { opacity: 1, x: 0 },
  gone: (dir: number) => ({ opacity: 0, x: dir * -28, transition: spring.focus }),
};
