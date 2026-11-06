import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type AccessibilityState, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme";
import { timings } from "./motion";

type Feel = "selection" | "light" | "none";

const buzz = (feel: Feel) => {
  if (feel === "selection") void Haptics.selectionAsync().catch(() => {});
  else if (feel === "light") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/** Ink laid over something held, as the web's --pressed is: a whisper of the text colour. */
const heldWash = (dark: boolean) => (dark ? "rgba(244,244,243,0.07)" : "rgba(5,5,5,0.05)");

/**
 * A piece of content you press (a cell in the day's block, a class in the list), with a tick of haptics. Held, it takes
 * a faint wash of ink, as a row on the web lights under the pointer, easing in and out on the state ease (the web's
 * --dur-state) on the UI thread: no spring, nothing that bounces back.
 * Controls are not drawn with this: they are the glass kit's (components/ui/glass.tsx). `style` is the pressed part;
 * `outerStyle` is the touch area's place in the layout.
 */
export function Press({
  children,
  onPress,
  label,
  hint,
  role = "button",
  state,
  feel = "selection",
  disabled,
  style,
  outerStyle,
}: {
  children: ReactNode;
  onPress?: () => void;
  label: string;
  hint?: string;
  role?: "button" | "link";
  state?: AccessibilityState;
  feel?: Feel;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const down = useSharedValue(0);
  const wash = useAnimatedStyle(() => ({ opacity: down.get() }));
  // Nothing to open (a guest's day, features/guest): the same content, read as one thing, not a button that does nothing.
  if (!onPress)
    return (
      <View accessible accessibilityLabel={label} style={outerStyle}>
        <View style={style}>{children}</View>
      </View>
    );
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, ...state }}
      disabled={disabled}
      onPressIn={() => down.set(withTiming(1, timings.press))}
      onPressOut={() => down.set(withTiming(0, timings.press))}
      onPress={() => {
        buzz(feel);
        onPress?.();
      }}
      style={outerStyle}
    >
      <Animated.View style={style}>
        {children}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: heldWash(c.dark) }, wash]} />
      </Animated.View>
    </Pressable>
  );
}
