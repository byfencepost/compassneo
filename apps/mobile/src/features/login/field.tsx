import { useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme/theme";
import { radius, space, type as scale } from "@/theme/tokens";
import { Glass } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";

/**
 * The sign-in's text field: the shared Field's glass capsule (components/ui/field.tsx), ringed Neo blue while the
 * cursor is in it and coral with an error, with room inside it for a leading icon and a trailing control (a clear
 * button, the password's show and hide, the ".compass.education" an address ends with). The error and the hint can
 * both show, as the address step on the web does: the error says what is wrong, the hint how to fix it.
 */
export function LoginField({
  label,
  error,
  hint,
  leading,
  trailing,
  mono,
  style,
  onFocus,
  onBlur,
  ref,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Tabular figures for an address or a revealed password, as the web's `mono`. */
  mono?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  const ring = error ? c.fail : focused ? c.lineFocus : null;
  return (
    <View style={{ gap: space[1.5] }}>
      {label && (
        <Text variant="label" importantForAccessibility="no" accessibilityElementsHidden style={{ paddingHorizontal: space[1] }}>
          {label}
        </Text>
      )}
      <View>
        <Glass round={radius.pill}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: 52,
              gap: space[2],
              paddingLeft: leading ? space[4] : space[5],
              paddingRight: trailing ? space[1] : space[5],
            }}
          >
            {leading}
            <TextInput
              ref={ref}
              accessibilityLabel={label}
              accessibilityHint={error ?? hint}
              placeholderTextColor={c.text3}
              selectionColor={c.neo}
              cursorColor={c.neo}
              onFocus={e => {
                setFocused(true);
                onFocus?.(e);
              }}
              onBlur={e => {
                setFocused(false);
                onBlur?.(e);
              }}
              {...props}
              style={[
                scale.body,
                mono && { fontVariant: ["tabular-nums"], fontWeight: "500" },
                { flex: 1, height: "100%", paddingVertical: 0, color: c.text1 },
                style,
              ]}
            />
            {trailing}
          </View>
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
      ) : null}
      {hint ? (
        <Text variant="caption" tone="2" style={{ paddingHorizontal: space[1] }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
