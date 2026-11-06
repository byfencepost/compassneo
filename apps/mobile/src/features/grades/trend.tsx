import { View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useTheme } from "@/theme/theme";
import { Text } from "@/components/ui/text";
import { pct, tabular, trendWords, type GradeTrend } from "./data";

/**
 * How a grade moved, as the web's TrendMark shows it: an arrow and the points, green up and amber down. On its own it
 * says the move in full to a screen reader; inside a row the row's own label says it (trendWords).
 */
export function TrendMark({ trend, now }: { trend: GradeTrend; now: number }) {
  const c = useTheme();
  const up = trend.change > 0;
  const color = up ? c.okText : c.warnText;
  return (
    <View accessible accessibilityLabel={trendWords(trend, now)} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <SymbolView
        name={{ ios: up ? "arrow.up.right" : "arrow.down.right", android: up ? "north_east" : "south_east" }}
        size={12}
        weight="bold"
        tintColor={color}
        fallback={
          <Text variant="caption" color={color}>
            {up ? "↗" : "↘"}
          </Text>
        }
      />
      <Text variant="caption" color={color} style={[tabular, { fontWeight: "600" }]}>
        {pct(Math.abs(trend.change))}
      </Text>
    </View>
  );
}
