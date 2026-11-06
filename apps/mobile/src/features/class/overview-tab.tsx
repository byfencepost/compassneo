import { useState } from "react";
import { View } from "react-native";
import { Rule } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { dayIn, dayName, daysApart } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Linked, SourceTag } from "./bits";
import { SOURCE, type ClassDetail, type ClassLesson, type LessonPlan, type SemesterGrade } from "./data";
import { AssessmentRow, GradeSummary, GradeWaiting } from "./grade-parts";
import { Block, Divided, FootChip, OpenRow, ROW, SkeletonBlock } from "./kit";
import { LessonCard, LessonRow, PlanCard } from "./lesson-parts";
import type { TabId } from "./tabs";
import { timeOf } from "./work";

/**
 * The overview answers the plain questions, a card each, every card only when it has an answer: when the class is (and
 * its plan), how the grade is going and its latest marks, what is due, what the teacher posted, and the next lessons.
 * A card with more behind it opens its tab. After the web's class-panel.tsx. When the class's detail lands after the
 * overview is up, its cards rise into place down the page, one step apart.
 */

const LATEST = 3;
const SHOWN_NOTICES = 3;

export function OverviewTab({
  detail,
  lead,
  after,
  plans,
  zone,
  today,
  now,
  has,
  go,
}: {
  /** undefined while loading, null when Compass Neo knows nothing of the class. */
  detail: ClassDetail | null | undefined;
  lead: { lesson: ClassLesson; next: boolean } | null;
  after: ClassLesson[];
  plans: Record<string, LessonPlan | null | undefined>;
  zone: string;
  today: string;
  now: number;
  has: Record<TabId, boolean>;
  go: (tab: TabId) => void;
}) {
  const plan = lead ? plans[lead.lesson.id] : null;
  const top = (
    <>
      {lead && <LessonCard lesson={lead.lesson} next={lead.next} zone={zone} today={today} now={now} />}
      {plan && <PlanCard plan={plan} />}
    </>
  );
  if (detail === undefined)
    return (
      <>
        {top}
        <SkeletonBlock rows={[56, 36, 36, 36]} />
        <SkeletonBlock rows={[20, 20]} />
      </>
    );
  if (!detail)
    return (
      <>
        {top}
        <Text variant="bodySm" tone="2" style={{ paddingHorizontal: space[1] }}>
          Compass Neo has nothing more on this class.
        </Text>
      </>
    );
  const ready = detail.grades.status === "ready" ? detail.grades : null;
  const main = ready?.current ?? ready?.other ?? null;
  const vs = ready?.current ? ready.other : null;
  return (
    <>
      {top}
      {main ? <GradeBlock g={main} vs={vs} now={now} onMore={() => go("grades")} /> : <GradeWaiting grades={detail.grades} />}
      <DueBlock tasks={detail.tasks} zone={zone} today={today} now={now} onMore={has.work ? () => go("work") : undefined} />
      <NoticesBlock notices={detail.notices} zone={zone} today={today} />
      {after.length > 0 && (
        <Block glyph="calendar" title="Next lessons" onMore={has.lessons ? () => go("lessons") : undefined} moreLabel="All lessons" index={3}>
          <Divided>
            {after.map(l => (
              <LessonRow key={l.id} lesson={l} zone={zone} today={today} now={now} plan={plans[l.id]} />
            ))}
          </Divided>
        </Block>
      )}
    </>
  );
}

/** The grade and its latest few marks. Everything else is on the Grades tab. */
function GradeBlock({ g, vs, now, onMore }: { g: SemesterGrade; vs: SemesterGrade | null; now: number; onMore: () => void }) {
  const latest = g.tasks
    .map((t, i) => ({ t, i }))
    .filter(x => x.t.mark != null)
    .sort((a, b) => (b.t.markedAt ?? 0) - (a.t.markedAt ?? 0) || b.i - a.i)
    .slice(0, LATEST)
    .map(x => x.t);
  return (
    <Block glyph="grade" title={`Grade · Semester ${g.semester}`} onMore={onMore} moreLabel="All grades">
      <GradeSummary g={g} vs={vs} />
      {latest.length > 0 && (
        <>
          <Rule />
          <Text variant="overline" tone="3" style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
            Latest marks
          </Text>
          <Divided>
            {latest.map((t, i) => (
              <AssessmentRow key={`${g.semester}-${t.id}`} t={t} now={now} index={i} />
            ))}
          </Divided>
        </>
      )}
    </Block>
  );
}

/** Learning tasks still to come: the name and the day it is due, amber from the day before. */
function DueBlock({ tasks, zone, today, now, onMore }: { tasks: ClassDetail["tasks"]; zone: string; today: string; now: number; onMore?: () => void }) {
  const c = useTheme();
  const ahead = tasks.filter(t => !t.due || Date.parse(t.due) >= now);
  if (!ahead.length) return null;
  return (
    <Block glyph="work" title="Due" onMore={onMore} moreLabel="All work" index={1}>
      <Divided>
        {ahead.map((t, i) => {
          const due = t.due ? dayIn(zone, t.due) : null;
          const away = due ? daysApart(today, due) : null;
          const soon = away != null && away <= 1;
          const when = due ? dayName(due, today) : "No date";
          return (
            <View key={t.id ?? `${t.name}-${i}`} style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3] }]} accessible accessibilityLabel={`${t.name}, due ${when}`}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" numberOfLines={2}>
                  {t.name}
                </Text>
                {t.due && (
                  <Text variant="caption" tone="3" style={{ fontVariant: ["tabular-nums"] }}>
                    Due {timeOf(t.due, zone)}
                    {away != null && away > 1 ? ` · in ${away} days` : ""}
                  </Text>
                )}
              </View>
              <Text variant="label" color={soon ? c.warnText : c.text2} style={{ fontWeight: soon ? "600" : "500" }}>
                {when}
              </Text>
            </View>
          );
        })}
      </Divided>
    </Block>
  );
}

/** The teachers' notices, newest first: a few, each opening to its text, and the rest a press away. */
function NoticesBlock({ notices, zone, today }: { notices: ClassDetail["notices"]; zone: string; today: string }) {
  const [all, setAll] = useState(false);
  if (!notices.length) return null;
  const shown = all ? notices : notices.slice(0, SHOWN_NOTICES);
  // Each says where it is from only when they come from more than one place.
  const mixed = new Set(notices.map(n => n.source)).size > 1;
  return (
    <Block glyph="notice" title="Notices" index={2}>
      <Divided>
        {shown.map(n => {
          const when = n.at ? dayName(dayIn(zone, n.at), today) : null;
          return (
            <OpenRow
              key={String(n.id)}
              label={[n.title, when, n.author && `from ${n.author}`, mixed && `on ${SOURCE[n.source]}`].filter(Boolean).join(", ")}
              body={
                n.text || n.author ? (
                  <View style={{ gap: space[2] }}>
                    {n.text && (
                      <Text variant="bodySm" tone="2" selectable>
                        <Linked text={n.text} />
                      </Text>
                    )}
                    {n.author && (
                      <Text variant="caption" tone="3">
                        {n.author}
                      </Text>
                    )}
                  </View>
                ) : null
              }
              head={
                <View style={{ gap: 2 }}>
                  <Text variant="label" numberOfLines={2}>
                    {n.title}
                  </Text>
                  <View style={{ flexDirection: "row", gap: space[2] }}>
                    {when && (
                      <Text variant="caption" tone="2">
                        {when}
                      </Text>
                    )}
                    {mixed && <SourceTag source={n.source} />}
                  </View>
                </View>
              }
            />
          );
        })}
      </Divided>
      {notices.length > SHOWN_NOTICES && (
        <>
          <Rule />
          <FootChip label={all ? "Show fewer" : `Show ${notices.length - SHOWN_NOTICES} more`} onPress={() => setAll(a => !a)} />
        </>
      )}
    </Block>
  );
}
