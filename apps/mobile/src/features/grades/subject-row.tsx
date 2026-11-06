import { View } from "react-native";
import { useTheme } from "@/theme/theme";
import { classColor } from "@/theme/tokens";
import { Text } from "@/components/ui/text";
import { ListRow } from "./list-row";
import { SubjectGlyph } from "./subject-glyph";
import { TrendMark } from "./trend";
import { moved, pct, tabular, trendWords, type OverviewSubject } from "./data";

/**
 * A subject in the list, as the web's Grades page has it (apps/web/app/features/student/grades.tsx `SubjectRow`): its
 * glyph in its class's colour (the colour it has on the timetable), its name and the mark that came in last, how it
 * moved, and its figure in the same colour, then a chevron. A subject no class on the timetable claims now (last
 * semester's, a class since dropped) has no class to open: it is drawn in grey and presses nothing. It comes into
 * focus when it first appears, `index` beats after the list's first row.
 */
export function SubjectRow({ s, now, onOpen, index = 0 }: { s: OverviewSubject; now: number; onOpen: (code: string) => void; index?: number }) {
  const c = useTheme();
  const color = s.hue != null ? classColor(s.hue, c).accent : c.text2;
  const latest = s.latest
    ? `${s.latest.name}${s.latest.percent != null ? ` · ${pct(s.latest.percent)}%` : ""}`
    : s.total
      ? "Nothing marked yet"
      : "No assessments yet";
  const trend = moved(s.trend) ? s.trend : null;
  const figure = s.percent != null ? `${pct(s.percent)}%${s.letter ? `, ${s.letter}` : ""}` : "nothing marked yet";
  const label = [s.name, figure, trend && trendWords(trend, now), s.latest && `Latest: ${latest}`].filter(Boolean).join(". ");
  const code = s.code;

  return (
    <ListRow dense arrive={index} label={label} hint={code ? "Opens this class's grades" : undefined} onPress={code ? () => onOpen(code) : undefined}>
      <SubjectGlyph names={[s.subject, s.name, s.code]} color={color} size={16} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" tone={s.percent == null ? "2" : "1"} numberOfLines={1}>
          {s.name}
        </Text>
        <Text variant="caption" tone="3" numberOfLines={1} style={tabular}>
          {latest}
        </Text>
      </View>
      {trend && <TrendMark trend={trend} now={now} />}
      {s.percent != null && (
        <Text variant="label" color={color} style={[tabular, { fontWeight: "600" }]}>
          {pct(s.percent)}%
          {s.letter && (
            <Text variant="label" tone="3">
              {` ${s.letter}`}
            </Text>
          )}
        </Text>
      )}
    </ListRow>
  );
}
