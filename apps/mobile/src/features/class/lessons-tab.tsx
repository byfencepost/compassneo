import { View } from "react-native";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { minutes } from "@/lib/days";
import { space } from "@/theme/tokens";
import { TeacherFace } from "./bits";
import type { ClassDetail, LessonPlan } from "./data";
import { Arrive, Block, Divided, ROW } from "./kit";
import { LessonRow } from "./lesson-parts";
import { mondayOf, weekName, weeksOf, type Week } from "./lessons";

/**
 * Lessons: the class's usual week at a glance, then its lessons in the weeks around now, a card a week. This week and
 * those after lead (a lesson already over this week dims in place), the teachers follow, and the weeks gone by sit at
 * the end, dimmed, newest first. A lesson with a plan opens to it. After the web's pages.tsx. Landing after the section
 * (the class's detail coming in), the cards rise into place down the page.
 */
export function LessonsTab({ detail, plans, zone, today, now }: { detail: ClassDetail; plans: Record<string, LessonPlan | null | undefined>; zone: string; today: string; now: number }) {
  const weeks = weeksOf(detail.lessons);
  const thisWeek = mondayOf(today);
  const ahead = weeks.filter(w => w.monday >= thisWeek);
  const behind = weeks.filter(w => w.monday < thisWeek).reverse();
  const [usual, ...others] = detail.rooms;
  const facts: { label: string; value: string; more?: string }[] = [];
  if (detail.perWeek != null) facts.push({ label: detail.perWeek === 1 ? "Lesson a week" : "Lessons a week", value: String(detail.perWeek) });
  if (detail.minutesPerWeek) facts.push({ label: "Time a week", value: minutes(detail.minutesPerWeek * 60000) });
  if (usual) facts.push({ label: "Usual room", value: usual.room, more: others.length ? `Sometimes ${others.map(r => r.room).join(", ")}` : undefined });

  const week = (w: Week, i: number) => (
    <Block key={w.monday} glyph="calendar" title={weekName(w.monday, today)} index={i}>
      <Divided>
        {w.lessons.map(l => (
          <LessonRow key={l.id} lesson={l} zone={zone} today={today} now={now} plan={plans[l.id]} />
        ))}
      </Divided>
    </Block>
  );

  return (
    <>
      {facts.length > 0 && (
        <Arrive>
          <View style={{ flexDirection: "row", gap: space[3] }}>
            {facts.map(f => (
              <Card key={f.label} style={{ flex: 1 }} panelStyle={{ gap: 2, paddingVertical: space[3] }}>
                <View accessible accessibilityLabel={`${f.label}: ${f.value}${f.more ? `. ${f.more}` : ""}`}>
                  <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontVariant: ["tabular-nums"] }}>
                    {f.value}
                  </Text>
                  <Text variant="caption" tone="2" numberOfLines={2}>
                    {f.label}
                  </Text>
                  {f.more && (
                    <Text variant="caption" tone="3" numberOfLines={2}>
                      {f.more}
                    </Text>
                  )}
                </View>
              </Card>
            ))}
          </View>
        </Arrive>
      )}
      {ahead.length ? (
        ahead.map((w, i) => week(w, i + 1))
      ) : (
        <Text variant="bodySm" tone="2" style={{ paddingHorizontal: space[1] }}>
          No more lessons in the synced timetable.
        </Text>
      )}
      {detail.teachers.length > 0 && (
        <Block glyph="teacher" title={detail.teachers.length === 1 ? "Teacher" : "Teachers"} index={ahead.length + 1}>
          <Divided>
            {detail.teachers.map(p => (
              <View key={p.code || p.full || p.name} style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3] }]} accessible accessibilityLabel={p.full ?? p.name}>
                <TeacherFace person={p} size={34} />
                <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                  {p.full ?? p.name}
                </Text>
              </View>
            ))}
          </Divided>
        </Block>
      )}
      {behind.map((w, i) => week(w, ahead.length + 2 + i))}
    </>
  );
}
