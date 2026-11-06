import { useState } from "react";
import { View } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { GlassChip, GlassGroup, GlassIconButton } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { addDays, daysApart, longDay } from "@/lib/days";
import { focusIn, rise } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { dayTitle } from "./day";
import { Glyph, GLYPHS } from "./glyph";
import { labelEntering, labelExiting } from "./motion";
import { tabular } from "./parts";

/** The day arrows' size: a touch under the kit's 44, so the pair sits light beside the day's two lines. */
const ARROW = 40;

const SUMMARY_IN = focusIn();
const TODAY_IN = rise();

/**
 * Which way the day last moved (1 on, -1 back), kept from one day to the next: 0 until it first has.
 * Worked out as the day changes, so the render that shows the new day already knows.
 */
function useTurn(day: string): -1 | 0 | 1 {
  const [seen, setSeen] = useState<{ day: string; dir: -1 | 0 | 1 }>({ day, dir: 0 });
  if (seen.day === day) return seen.dir;
  const dir = daysApart(seen.day, day) > 0 ? 1 : -1;
  setSeen({ day, dir });
  return dir;
}

/**
 * The day, right under its classes, as the web's day picker has it: which day this is ("Today · Fri 6 Nov", "Monday ·
 * 9 Nov") with a line about it under ("5 classes · 8:50 – 3:10"), a day back and a day on, and a way back to today
 * once you have left it. The controls are Liquid Glass in one group, so the "Today" capsule and the two round arrows
 * melt into one another as iOS's grouped controls do. The arrows hold their place at the end of the row, so tapping on
 * through the week never chases a moving button: "Today" takes its place to their left, rising into it (a move only:
 * glass must never fade). Steps are a day at a time, weekends included, as on the web.
 *
 * As the day changes, its name turns over the way you went, as the web's day label does: the new one comes up from
 * below going on (down from above going back) while the old one fades where it stood. A line about the day that only
 * now came in comes into focus; one already there arrives with its day.
 */
export function DayPicker({ day, today, summary, onMove, onToday }: { day: string; today: string; summary: string | null; onMove: (by: -1 | 1) => void; onToday: () => void }) {
  const c = useTheme();
  const away = day !== today;
  const dir = useTurn(day);
  const { name, date } = dayTitle(day, today);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingLeft: space[1], minHeight: 44 }}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={[name === "Today" || name === "Tomorrow" || name === "Yesterday" ? name : null, longDay(day), summary].filter(Boolean).join(", ")}
        style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
      >
        <Animated.View key={day} entering={labelEntering[dir]} exiting={labelExiting}>
          <LayoutAnimationConfig skipEntering>
            <Text variant="label" numberOfLines={1} style={{ fontWeight: "600" }}>
              {name}
              {date && (
                <Text variant="label" tone="3" style={[tabular, { fontWeight: "500" }]}>
                  {` · ${date}`}
                </Text>
              )}
            </Text>
            {summary ? (
              <Animated.View entering={SUMMARY_IN} style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
                <Text variant="caption" tone="3" style={[tabular, { fontSize: 12, lineHeight: 16 }]} numberOfLines={1}>
                  {summary}
                </Text>
              </Animated.View>
            ) : (
              <Text variant="caption" tone="3" style={[tabular, { fontSize: 12, lineHeight: 16 }]} numberOfLines={1}>
                {" "}
              </Text>
            )}
          </LayoutAnimationConfig>
        </Animated.View>
      </View>
      <GlassGroup style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexShrink: 0 }}>
        {away && (
          <Animated.View entering={TODAY_IN}>
            <GlassChip size="sm" label="Today" accessibilityHint="Back to today's classes" icon={<Glyph name="today" size={13} color={c.text1} weight="semibold" />} onPress={onToday} />
          </Animated.View>
        )}
        <GlassIconButton
          ios={GLYPHS.back.ios}
          android={GLYPHS.back.android}
          size={ARROW}
          label={`Day before, ${longDay(addDays(day, -1))}`}
          onPress={() => onMove(-1)}
        />
        <GlassIconButton
          ios={GLYPHS.forward.ios}
          android={GLYPHS.forward.android}
          size={ARROW}
          label={`Day after, ${longDay(addDays(day, 1))}`}
          onPress={() => onMove(1)}
        />
      </GlassGroup>
    </View>
  );
}
