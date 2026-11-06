import type { ReactNode } from "react";
import { Pressable, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme";
import { radius, SHELL_INSET, space } from "@/theme/tokens";

/** A card's outer corner: Glaze's shell, as on the web. Its panel's is 3pt less, so the two stay concentric. */
export const CARD_RADIUS = radius.shell;

/**
 * A card the way the web draws one (Glaze): a grey shell with a paper panel inside it, 3pt in, corners concentric.
 * `foot` sits in the shell under the panel (a caption and an action). `tint` colours the shell (a class's tint).
 * Pressable when given onPress: it sinks a touch under the finger. `panelStyle` styles the content area.
 */
export function Card({
  children,
  foot,
  onPress,
  padded = true,
  tint,
  style,
  panelStyle,
  accessibilityLabel,
}: {
  children: ReactNode;
  foot?: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  tint?: ColorValue;
  style?: StyleProp<ViewStyle>;
  panelStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: tint ?? c.shell,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          padding: SHELL_INSET,
          borderWidth: 1,
          borderColor: c.lineFaint,
        },
        onPress ? undefined : style,
      ]}
    >
      <View
        style={[
          {
            backgroundColor: c.paper,
            borderRadius: CARD_RADIUS - SHELL_INSET,
            borderCurve: "continuous",
            padding: padded ? space[4] : 0,
            overflow: "hidden",
          },
          panelStyle,
        ]}
      >
        {children}
      </View>
      {foot != null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], paddingVertical: space[1.5], minHeight: 40 }}>
          {foot}
        </View>
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}
    >
      {body}
    </Pressable>
  );
}

/** A hairline between rows inside a card. */
export function Rule({ inset = 0 }: { inset?: number }) {
  const c = useTheme();
  return <View style={{ height: 1, backgroundColor: c.lineFaint, marginLeft: inset }} />;
}
