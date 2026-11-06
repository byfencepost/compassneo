import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme/theme";
import { radius, space } from "@/theme/tokens";
import { Text } from "./text";

/**
 * A small pill: a room, a status ("Overdue", "Handed in"), a count. Tone tints it; `fill` and `on` paint it solid
 * (a class's colour, for the class on now).
 */
export function Chip({
  children,
  tone = "neutral",
  fill,
  on,
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "neo" | "ok" | "warn" | "fail";
  fill?: string;
  on?: string;
  icon?: ReactNode;
}) {
  const c = useTheme();
  const bg = fill ?? { neutral: c.field, neo: c.dark ? "rgba(10,132,255,0.18)" : "rgba(0,129,255,0.12)", ok: c.okTint, warn: c.warnTint, fail: c.failTint }[tone];
  const fg = on ?? { neutral: c.text2, neo: c.neoText, ok: c.okText, warn: c.warnText, fail: c.failText }[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: space[2],
        paddingVertical: 3,
      }}
    >
      {icon}
      <Text variant="caption" color={fg} style={{ fontWeight: "600" }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}
