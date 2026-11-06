import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme";
import { radius, space } from "@/theme/tokens";
import Animated from "react-native-reanimated";
import { Glass, usePressScale } from "./glass";
import { Text } from "./text";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, number> = { sm: 36, md: 46, lg: 54 };

/**
 * A glass capsule button. Primary is prominent glass tinted Neo blue, as iOS 26 draws its main action; secondary is
 * clear glass; ghost is the label alone; danger is glass tinted coral. `pending` shows a spinner and the pending label.
 */
export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  pending,
  pendingLabel,
  disabled,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const c = useTheme();
  const off = disabled || pending;
  const press = usePressScale(0.97);
  // Disabled (not pending), it turns to clear glass with grey ink: the glass never fades, since opacity breaks it.
  const greyed = disabled && !pending;
  const tint = greyed ? undefined : { primary: c.neo, secondary: undefined, ghost: undefined, danger: c.fail }[variant];
  const fg = greyed ? c.textDisabled : { primary: "#fff", secondary: c.text1, ghost: c.neoText, danger: "#fff" }[variant];
  const inner = (
    <>
      {pending ? <ActivityIndicator size="small" color={fg} /> : icon ? <View>{icon}</View> : null}
      <Text variant={size === "sm" ? "caption" : "label"} color={fg} style={{ fontWeight: "600", fontSize: size === "sm" ? 14 : 16 }}>
        {pending && pendingLabel ? pendingLabel : children}
      </Text>
    </>
  );
  const layout: ViewStyle = {
    height: HEIGHT[size],
    paddingHorizontal: size === "sm" ? space[4] : space[6],
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space[2],
  };
  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!pending }}
      disabled={off}
      // The small size is drawn at 36pt; its touch area still reaches 44.
      hitSlop={size === "sm" ? 4 : undefined}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={style}
    >
      <Animated.View style={press.style}>
        {variant === "ghost" ? (
          <View style={layout}>{inner}</View>
        ) : (
          <Glass tint={tint} round={radius.pill} style={layout}>
            {inner}
          </Glass>
        )}
      </Animated.View>
    </Pressable>
  );
}
