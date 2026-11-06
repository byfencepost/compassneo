import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/theme";
import { type as scale, type Palette, type TypeName } from "@/theme/tokens";

type Tone = "1" | "2" | "3" | "disabled" | "inverse" | "neo" | "ok" | "warn" | "fail";

const toneColor = (c: Palette, tone: Tone) =>
  ({
    "1": c.text1,
    "2": c.text2,
    "3": c.text3,
    disabled: c.textDisabled,
    inverse: c.textInverse,
    neo: c.neoText,
    ok: c.okText,
    warn: c.warnText,
    fail: c.failText,
  })[tone];

/**
 * Text in the type scale: `<Text variant="heading">`, `<Text variant="caption" tone="2">`. Tone picks the colour
 * from the theme (1 primary, 2 secondary, 3 placeholder); `color` overrides it (a class's accent).
 */
export function Text({
  variant = "body",
  tone = "1",
  color,
  style,
  ...props
}: TextProps & { variant?: TypeName; tone?: Tone; color?: string }) {
  const c = useTheme();
  return <RNText {...props} style={[scale[variant] as TextStyle, { color: color ?? toneColor(c, tone) }, style]} />;
}
