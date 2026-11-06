import { View } from "react-native";
import Animated from "react-native-reanimated";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { lastLessonText } from "@/lib/days";
import { Card, Rule } from "@/components/ui/card";
import { Icon } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { ListRow } from "@/features/grades/list-row";
import { SubjectGlyph } from "@/features/grades/subject-glyph";
import { tabular } from "@/features/grades/data";
import { dueOf, SOURCE, type TodoItem } from "./data";

/**
 * A piece of work, as the web's to-do list draws one (apps/web/app/features/home/todo-list.tsx): its class's glyph in
 * the class's colour, the work, then its class (and "Important", "Not handed in online" when they are so), the class's
 * last lesson before it is due on a line of its own, and when it is due at the row's end (amber once it is late, full
 * ink while it is today's or tomorrow's). Pressing it opens the class on its Work; like the web's, it has no chevron.
 * Work for a class not on the timetable now has no class to open: its glyph is grey, and it presses nothing. It comes
 * into focus when it first appears, `index` beats after its list's first row (theme/motion.ts focusIn).
 */
export function TodoRow({
  item,
  zone,
  today,
  onOpen,
  index = 0,
}: {
  item: TodoItem;
  zone: string;
  today: string;
  onOpen: (code: string) => void;
  /** Its place in the list, for the arrival's stagger. */
  index?: number;
}) {
  const c = useTheme();
  const color = item.hue != null ? classColor(item.hue, c).accent : c.text3;
  const due = dueOf(item, zone, today);
  const notes = [item.className, item.important && "Important", item.offline && "Not handed in online"].filter(Boolean).join(" · ");
  // Only while it can still be done on time: past its date, the last lesson before it is no help.
  const last = item.overdue ? null : lastLessonText(item.lastLesson, today, zone);
  const dueColor = due.tone === "late" ? c.warnText : due.tone === "soon" ? c.text1 : c.text2;
  const label = [item.name, notes, due.text, last, `From ${SOURCE[item.source]}`].filter(Boolean).join(". ");
  const code = item.code;

  return (
    <ListRow dense chevron={false} arrive={index} label={label} hint={code ? "Opens this class's work" : undefined} onPress={code ? () => onOpen(code) : undefined}>
      <SubjectGlyph names={[item.className, item.code]} color={color} size={16} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {item.name}
        </Text>
        {notes.length > 0 && (
          <Text variant="caption" tone="3" numberOfLines={1}>
            {notes}
          </Text>
        )}
        {last && (
          <Text variant="caption" tone="3" numberOfLines={1}>
            {last}
          </Text>
        )}
      </View>
      <Text variant="caption" color={dueColor} numberOfLines={1} style={[tabular, { flexShrink: 0, textAlign: "right" }]}>
        {due.text}
      </Text>
    </ListRow>
  );
}

/**
 * Nothing to hand in: one quiet row, as the web says it, so the list never comes and goes between syncs. It comes into
 * focus when it appears (the last piece handed in, or the list first arriving empty).
 */
export function AllCaughtUp() {
  const c = useTheme();
  return (
    <Animated.View entering={focusIn()}>
      <Card padded={false}>
        <View accessible accessibilityLabel="All caught up. Nothing to hand in." style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: 14, minHeight: 48 }}>
          <Icon ios="checkmark.circle.fill" android="task_alt" size={16} color={c.okText} />
          <Text variant="label" tone="2" style={{ flex: 1 }}>
            All caught up
          </Text>
          <Text variant="caption" tone="3" numberOfLines={1}>
            Nothing to hand in
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}

/** Work on its way: a few rows the height they will have. */
export function TodoRowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Card padded={false}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          {i > 0 && <Rule />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: 14, paddingVertical: space[2], minHeight: 52 }}>
            <Skeleton height={16} width={16} round={8} />
            <View style={{ flex: 1, gap: space[1.5] }}>
              <Skeleton height={14} width="60%" />
              <Skeleton height={11} width="35%" />
            </View>
            <Skeleton height={11} width={64} />
          </View>
        </View>
      ))}
    </Card>
  );
}
