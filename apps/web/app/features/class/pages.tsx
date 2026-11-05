import { SegmentedControl, SegmentedControlItem } from "@/components/glaze/ui/segmented-control";
import { Assessments as AssessmentsGlyph, Calendar, ChartLine, Grade, Room, Teacher, Time } from "@/components/glaze/icon";
import { minutes } from "@/lib/neo/days";
import { cn } from "@/lib/glaze/utils";
import { pct, runningGrade, standing, type ClassDetail, type SemesterGrade } from "@/lib/neo/classes";
import type { LessonPlan } from "@/lib/neo/plans";
import { TeacherFace } from "@/features/timetable/class-card";
import { GradeChanges, GradeChart, Semesters, toneText } from "./grade-history";
import { AssessmentRows, Block, GradeSummary, LessonRows, Row, type PanelLesson } from "./sections";

/**
 * The class panel's sections past the overview, each the whole of one thing: every figure about the grade (with its
 * graph) and the class's week. Work, Files and People have files of their own (work.tsx, files.tsx, people.tsx).
 */

// ---------- grades ----------

/**
 * Where the semester could end up from here. A bar from the lowest possible finish (nothing more earned) to the
 * highest (full marks on everything left), marking where keeping up the average so far lands. Under it, a few plain
 * "if you get this on the rest, you finish on that" rows.
 */
function WhereYouFinish({ g }: { g: SemesterGrade }) {
  const s = standing(g);
  if (!s || s.left <= 0.5) return null;
  const at = (onRest: number) => s.floor + (onRest / 100) * (s.ceiling - s.floor);
  const marked = s.total - s.left;
  const pace = marked > 0 ? (100 * s.earned) / marked : null;
  const rows: Array<{ label: React.ReactNode; finish: number }> = [{ label: "Full marks on the rest", finish: s.ceiling }];
  if (pace != null && pace < 99.5 && pace > 0.5)
    rows.push({ label: <>Keep up your <span className="neo-tabular">{pct(pace)}%</span> average</>, finish: at(pace) });
  if (pace == null || Math.abs(pace - 50) > 2.5) rows.push({ label: "Half marks on the rest", finish: at(50) });
  rows.push({ label: "Nothing more", finish: s.floor });
  rows.sort((x, y) => y.finish - x.finish);
  return (
    <Block icon={Grade} title="Where you could finish">
      <div className="px-3.5 pt-3.5 pb-3">
        <div className="flex items-baseline justify-between type-caption text-text-3">
          <span>
            At worst <span className="neo-tabular text-text-1">{pct(s.floor)}%</span>
          </span>
          <span>
            At best <span className="neo-tabular text-text-1">{pct(s.ceiling)}%</span>
          </span>
        </div>
        <div
          className="neo-range mt-2"
          // eslint-disable-next-line glaze/no-inline-style -- the band and the marker sit where the numbers put them
          style={{ "--from": `${s.floor}%`, "--to": `${s.ceiling}%`, "--at": `${pace != null ? at(pace) : s.floor}%` } as React.CSSProperties}
        >
          <span className="neo-range-band" />
          {pace != null && <span className="neo-range-at" />}
        </div>
      </div>
      {rows.map(({ label, finish }, i) => (
        <Row key={i} className="flex items-center gap-3 py-2.5">
          <span className="min-w-0 flex-1 type-label text-text-2">{label}</span>
          <span className={cn("neo-tabular shrink-0 type-label", toneText(finish))}>{pct(finish)}%</span>
        </Row>
      ))}
      <p className="border-t border-line-faint px-3.5 py-2.5 type-caption text-text-3">
        <span className="neo-tabular">{pct((100 * s.left) / s.total)}%</span> of the grade is still to be marked.
      </p>
    </Block>
  );
}

export function GradesPage({
  current,
  other,
  sem,
  onSem,
  since,
  zone,
  today,
  now,
  wide,
}: {
  current: SemesterGrade | null;
  other: SemesterGrade | null;
  sem: number | null;
  onSem: (s: number) => void;
  since: number | null;
  zone: string;
  today: string;
  now: number;
  /** Maximised: the grade and its graph across the top, the assessments as a table, the rest beside it. */
  wide?: boolean;
}) {
  const both = current && other ? [current, other].sort((a, b) => a.semester - b.semester) : null;
  const g = (both && sem != null && both.find(s => s.semester === sem)) || current || other;
  if (!g) return null;
  const vs = both?.find(s => s !== g) ?? null;
  const marked = runningGrade(g.tasks).length > 0;
  const changed = g.points.some(p => !p.baseline) || g.tasks.some(t => t.markedAt != null);
  const semPicker = both && (
    <SegmentedControl size="sm" aria-label="Semester" value={String(g.semester)} onValueChange={v => onSem(Number(v))}>
      {both.map(s => (
        <SegmentedControlItem key={s.semester} value={String(s.semester)}>
          Sem {s.semester}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );

  return (
    <>
      <Block icon={AssessmentsGlyph} title={`Semester ${g.semester}`} aside={semPicker}>
        <GradeSummary g={g} vs={vs} />
      </Block>
      {marked && (
        <Block icon={ChartLine} title="Grade over time" className="px-4 pt-4 pb-3.5">
          <GradeChart key={g.semester} grade={g} />
        </Block>
      )}
      <WhereYouFinish g={g} />
      {both && (
        <Block icon={ChartLine} title="Semester 1 vs 2" className="px-4 py-3.5">
          <Semesters current={both[1]!} other={both[0]!} />
        </Block>
      )}
      <Block icon={AssessmentsGlyph} title={`Assessments · ${g.marked} of ${g.total} marked`}>
        <AssessmentRows tasks={g.tasks} semester={g.semester} now={now} />
      </Block>
      {changed && (
        <Block icon={Time} title="Changes" className="px-4 py-3.5">
          <GradeChanges grade={g} since={since} zone={zone} today={today} />
        </Block>
      )}
    </>
  );
}

// ---------- lessons ----------

const AHEAD = 12;
const BEHIND = 3;

export function LessonsPage({ detail, plans, zone, today, now }: { detail: ClassDetail; plans: Record<string, LessonPlan | null | undefined>; zone: string; today: string; now: number }) {
  const ahead: PanelLesson[] = detail.lessons.filter(l => Date.parse(l.finish) > now).slice(0, AHEAD);
  const past: PanelLesson[] = detail.lessons.filter(l => Date.parse(l.finish) <= now).slice(-BEHIND).reverse();
  const [usual, ...others] = detail.rooms;
  const facts: Array<[string, React.ReactNode]> = [];
  if (detail.perWeek != null) facts.push(["Lessons a week", detail.perWeek]);
  if (detail.minutesPerWeek) facts.push(["Time a week", minutes(detail.minutesPerWeek * 60000)]);
  if (usual)
    facts.push([
      "Room",
      <>
        {usual.room}
        {others.length > 0 && <span className="text-text-2"> · sometimes {others.map(r => r.room).join(", ")}</span>}
      </>,
    ]);
  return (
    <>
      {facts.length > 0 && (
        <Block icon={Room} title="Usually">
          {facts.map(([k, v]) => (
            <Row key={k} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 type-label-sm text-text-2">{k}</span>
              <span className="neo-tabular shrink-0 type-label text-text-1">{v}</span>
            </Row>
          ))}
        </Block>
      )}
      <Block icon={Calendar} title="Coming up" className={ahead.length ? undefined : "px-4 py-3.5"}>
        {ahead.length ? (
          <LessonRows lessons={ahead} zone={zone} today={today} plans={plans} />
        ) : (
          <p className="type-body-sm text-text-2">No more lessons in the synced timetable.</p>
        )}
      </Block>
      {detail.teachers.length > 0 && (
        <Block icon={Teacher} title={detail.teachers.length === 1 ? "Teacher" : "Teachers"}>
          {detail.teachers.map(p => (
            <Row key={p.code || p.full || p.name} className="flex items-center gap-3 py-2.5">
              <TeacherFace person={p} className="size-8" textClassName="type-caption" />
              <span className="min-w-0 flex-1 truncate type-label text-text-1">{p.full ?? p.name}</span>
            </Row>
          ))}
        </Block>
      )}
      {past.length > 0 && (
        <Block icon={Calendar} title="Earlier">
          <LessonRows lessons={past} zone={zone} today={today} plans={plans} past />
        </Block>
      )}
    </>
  );
}
