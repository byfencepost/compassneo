import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import type { Palette } from "@/theme/tokens";

/** How far the colour runs on, solid, above the top of the screen: what a pull to refresh shows. */
const OVERSCROLL = 800;

/** How strong the colour is at the top: faint, so text over it keeps the page's own inks at full contrast. */
const strength = (c: Palette) => (c.dark ? 0.24 : 0.18);

/**
 * A page's own colour washing down from the top of the screen, the way the web's class panel tints its header
 * (apps/web/app/features/class/class.css, .neo-panel-top): strongest at the very top, behind the see-through
 * navigation bar, and gone into the flat page colour `height` points down. Everything else in the app sits on the
 * flat page; only the class page wears this.
 *
 * It goes first in a scroll's content, out of its flow, so it scrolls away with the top of the page. `behind` is how
 * far the screen's top is above where the content starts (the navigation bar it runs under); above that the colour
 * carries on solid, so pulling down never shows its edge.
 */
export function TopGlow({ color, behind = 0, height = 280 }: { color: string; behind?: number; height?: number }) {
  const c = useTheme();
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const a = strength(c);
  const total = OVERSCROLL + height;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", left: 0, right: 0, top: -(behind + OVERSCROLL), height: total }}
    >
      <Svg width="100%" height={total}>
        <Defs>
          {/* Eased, not straight: a linear fade shows a band where it meets the page. Above y1 it is solid. */}
          <LinearGradient id={id} x1="0" y1={OVERSCROLL} x2="0" y2={total} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={a} />
            <Stop offset="0.3" stopColor={color} stopOpacity={a * 0.72} />
            <Stop offset="0.6" stopColor={color} stopOpacity={a * 0.32} />
            <Stop offset="0.85" stopColor={color} stopOpacity={a * 0.08} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={total} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * The glow's colour at its very top, as a solid: the page with the colour over it. For a solid bar above the glow
 * (Android's navigation bar), so the bar and the glow under it meet without an edge.
 */
export function glowTop(color: string, c: Palette) {
  const rgb = (hex: string) => {
    const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const a = strength(c);
  const [r, g, b] = rgb(c.page).map((p, i) => Math.round(p + (rgb(color)[i]! - p) * a));
  return `rgb(${r},${g},${b})`;
}
