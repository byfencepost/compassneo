import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import Animated from "react-native-reanimated";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Text } from "@/components/ui/text";

/** A dense row, as the web's lists are (Glaze's px-3.5 py-2, min-h-13): grades, marks, work. */
const DENSE: ViewStyle = { paddingHorizontal: 14, paddingVertical: space[2], minHeight: 52 };

/**
 * A row in a list card that may open something. The whole row presses (a selection tick, a faint wash while held) and
 * ends in a chevron (an arrow out, for a page outside the app), unless `chevron` is false, as the web's lists of marks
 * and work have none; without onPress it is only a row, with nothing to press. Unlike the shared Row it takes the
 * words a screen reader says for it, since these rows are a picture and several lines that read badly one by one.
 *
 * Given `arrive` (its place in its list), it comes into focus when it first appears, a beat after the row above it
 * (theme/motion.ts focusIn); a row has no glass in it, so it may fade. Without, it is simply there (a row in a Fold,
 * which opens plainly).
 */
export function ListRow({
  children,
  onPress,
  label,
  hint,
  align = "center",
  external,
  chevron = true,
  dense,
  arrive,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Everything the row says, in one sentence. */
  label: string;
  /** What pressing it does ("Opens Maths"). */
  hint?: string;
  /** Top for rows of several lines, so the leading glyph sits by the first. */
  align?: "center" | "top";
  /** It opens a page outside the app: an arrow out instead of the chevron. */
  external?: boolean;
  /** False for a row that presses with nothing at its end (a mark, a piece of work), as on the web. */
  chevron?: boolean;
  /** The web's tighter padding, for long lists. */
  dense?: boolean;
  /** Its place in its list, for coming into focus a beat after the row above when it first appears. */
  arrive?: number;
}) {
  const c = useTheme();
  const style: ViewStyle = {
    flexDirection: "row",
    alignItems: align === "top" ? "flex-start" : "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
    ...(dense ? DENSE : null),
  };
  const row = !onPress ? (
    <View accessible accessibilityLabel={label} style={style}>
      {children}
    </View>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [style, pressed && { backgroundColor: c.lineFaint }]}
    >
      {children}
      {(chevron || external) && <View style={{ alignSelf: "center" }}>{external ? <OutArrow /> : <Chevron />}</View>}
    </Pressable>
  );
  return arrive == null ? row : <Animated.View entering={focusIn(arrive)}>{row}</Animated.View>;
}

/** The quiet arrow at the end of a row that opens something. */
export function Chevron() {
  const c = useTheme();
  return (
    <SymbolView
      name={{ ios: "chevron.right", android: "chevron_right" }}
      size={14}
      weight="semibold"
      tintColor={c.text3}
      accessible={false}
      fallback={
        <Text variant="heading" tone="3">
          ›
        </Text>
      }
    />
  );
}

/** The arrow at the end of a row that leaves the app (the web app, in the in-app browser). */
function OutArrow() {
  const c = useTheme();
  return (
    <SymbolView
      name={{ ios: "arrow.up.right", android: "open_in_new" }}
      size={13}
      weight="semibold"
      tintColor={c.text3}
      accessible={false}
      fallback={
        <Text variant="label" tone="3">
          ↗
        </Text>
      }
    />
  );
}
