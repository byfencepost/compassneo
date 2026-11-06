import { useState, type ComponentRef, type Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme/theme";
import { radius, space, type as scale } from "@/theme/tokens";
import { Glass } from "./glass";
import { Text } from "./text";

/**
 * A labelled text field: a glass capsule, ringed Neo blue while the cursor is in it, coral with the error under it.
 */
export function Field({
  label,
  error,
  hint,
  style,
  onFocus,
  onBlur,
  ref,
  ...props
}: TextInputProps & { label?: string; error?: string | null; hint?: string; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const ring = error ? c.fail : focused ? c.lineFocus : null;
  return (
    <View style={{ gap: space[1.5] }}>
      {label && (
        <Text variant="label" style={{ paddingHorizontal: space[1] }}>
          {label}
        </Text>
      )}
      <View>
        <Glass round={radius.pill}>
          <TextInput
            ref={ref}
            placeholderTextColor={c.text3}
            selectionColor={c.neo}
            onFocus={e => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={e => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...props}
            style={[scale.body, { height: 52, paddingHorizontal: space[5], color: c.text1 }, style]}
          />
        </Glass>
        {ring && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", inset: 0, borderRadius: radius.pill, borderCurve: "continuous", borderWidth: 1.5, borderColor: ring }}
          />
        )}
      </View>
      {error ? (
        <Text variant="caption" tone="fail" accessibilityLiveRegion="polite" style={{ paddingHorizontal: space[1] }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="2" style={{ paddingHorizontal: space[1] }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
