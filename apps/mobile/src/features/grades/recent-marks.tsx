import { View } from "react-native";
import Animated from "react-native-reanimated";
import { glide } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { classColor } from "@/theme/tokens";
import { dayIn, dayName, shortDate } from "@/lib/days";
import { Card, Rule } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ListRow } from "./list-row";
import { SubjectGlyph } from "./subject-glyph";
import { markColor, pct, tabular, type RecentMark } from "./data";

/**
 * Every subject's marks by the day a sync first saw them, newest first, as on the web: the day once for each day's
 * marks (a column, so the marks line up), then the subject's glyph, the assessment, its share of the grade and the mark
 * in its band's colour, in dense rows with no chevron, as the web lists them. Each opens its class's grades. Marks from
 * before Compass Neo kept history have no day, so they are not here; with none yet it says when the keeping began.
 * The marks come into focus one after another as they first appear; a mark that comes in later pushes the rest down,
 * and they glide there.
 */
export function RecentMarks({
  marks,
  since,
  zone,
  today,
  onOpen,
}: {
  marks: RecentMark[];
  since: number | null;
  zone: string;
  today: string;
  onOpen: (code: string) => void;
}) {
  if (!marks.length) {
    const began = since ? shortDate(dayIn(zone, since)) : null;
    return (
      <Card>
        <Text variant="bodySm" tone="2">
          {began
            ? `New marks show up here with the day they came in. Compass Neo has kept track since ${began}.`
            : "New marks show up here with the day they came in, from the next sync."}
        </Text>
      </Card>
    );
  }
  const dayOf = (m: RecentMark) => dayName(dayIn(zone, m.markedAt), today);
  return (
    <Card padded={false}>
      {marks.map((m, i) => {
        const day = dayOf(m);
        const first = i === 0 || dayOf(marks[i - 1]!) !== day;
        return (
          <Animated.View key={m.key} layout={glide}>
            {first && i > 0 && <Rule />}
            <MarkRow m={m} day={day} showDay={first} index={i} onOpen={onOpen} />
          </Animated.View>
        );
      })}
    </Card>
  );
}

function MarkRow({ m, day, showDay, index, onOpen }: { m: RecentMark; day: string; showDay: boolean; index: number; onOpen: (code: string) => void }) {
  const c = useTheme();
  const color = m.hue != null ? classColor(m.hue, c).accent : c.text2;
  const notes = [m.name, m.share != null && `${pct(m.share)}% of grade`, m.was != null && `was ${m.was}`].filter(Boolean).join(" · ");
  const mark = m.percent != null ? `${pct(m.percent)}%` : m.mark != null ? String(m.mark) : "–";
  const code = m.code;
  return (
    <ListRow
      dense
      chevron={false}
      arrive={index}
      label={`${day}. ${m.task}. ${notes}. ${m.percent != null ? `${pct(m.percent)}%` : (m.mark ?? "No mark")}`}
      hint={code ? "Opens this class's grades" : undefined}
      onPress={code ? () => onOpen(code) : undefined}
    >
      <Text variant="caption" tone="2" numberOfLines={1} style={{ width: 64, fontWeight: "600", opacity: showDay ? 1 : 0 }}>
        {day}
      </Text>
      <SubjectGlyph names={[m.name, m.code]} color={color} size={14} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {m.task}
        </Text>
        <Text variant="caption" tone="3" numberOfLines={1} style={tabular}>
          {notes}
        </Text>
      </View>
      <Text
        variant="label"
        color={m.percent != null ? markColor(m.percent, c) : c.text2}
        style={[tabular, { width: 56, textAlign: "right", fontWeight: "600" }]}
      >
        {mark}
      </Text>
    </ListRow>
  );
}
