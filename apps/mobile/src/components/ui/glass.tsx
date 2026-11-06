import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, View, type ColorValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { GlassContainer, GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { dur, ease, springs } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { alpha, radius, space } from "@/theme/tokens";
import { Text } from "./text";

/**
 * Liquid Glass (iOS 26's material, through expo-glass-effect, which Expo Go ships). Everything you touch is glass:
 * buttons, chips, segmented controls, the day picker, the header's buttons. Content (cards, rows) is not: it is drawn
 * the web's way (components/ui/card.tsx), and the glass floats on and among it. Where
 * the platform has no Liquid Glass (Android, iOS before 26), the same components fall back to a translucent paper
 * surface with a hairline, so layouts never change between the two.
 */

/** Liquid Glass is there to draw with. Checked once: it can't change while the app runs. */
export const liquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();


/**
 * How a glass control answers a finger: it settles a touch smaller and back, on a short ease. iOS 26's own
 * "interactive" glass (it swells and lights up under the finger, and bulges into its neighbours) is left off: it read
 * as a stuck hover. A transform on glass's parent is fine; only opacity breaks the effect.
 */
export function usePressScale(sink = 0.95) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    // As the web's glass: down in an instant (--dur-glass-press), back up on the house curve (--dur-glass-release).
    onPressIn: () => scale.set(withTiming(sink, { duration: dur.press, easing: ease.out })),
    onPressOut: () => scale.set(withTiming(1, { duration: dur.release, easing: ease.out })),
  };
}

/**
 * A glass surface. `tint` colours the glass (a class colour, Neo blue for a prominent control); `interactive` lets the
 * glass react to touch with iOS's own swell and shimmer (the kit's controls leave it off: see usePressScale); `clear` is the thinner, more
 * transparent variant for small controls over busy content. Follows the app's theme, not the phone's.
 */
export function Glass({
  children,
  style,
  tint,
  interactive,
  clear,
  round = radius.shell,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: ColorValue;
  interactive?: boolean;
  clear?: boolean;
  round?: number;
}) {
  const c = useTheme();
  const shape: ViewStyle = { borderRadius: round, borderCurve: "continuous" };
  if (liquidGlass)
    return (
      <GlassView
        glassEffectStyle={clear ? "clear" : "regular"}
        tintColor={tint}
        isInteractive={interactive}
        colorScheme={c.dark ? "dark" : "light"}
        style={[shape, { overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  // No Liquid Glass: paper at most of its strength, so the backdrop's colour still breathes through, edged like glass.
  // A tint lies over the paper (a solid hex one nearly opaque, as a prominent button's fill), never instead of it.
  const paper = alpha(c.dark ? "#1f1f1f" : "#ffffff", c.dark ? 0.82 : 0.78);
  const wash = typeof tint === "string" && tint.startsWith("#") ? alpha(tint, 0.88) : tint;
  return (
    <View
      style={[
        shape,
        {
          backgroundColor: paper,
          borderWidth: 1,
          borderColor: c.dark ? "rgba(255,255,255,0.09)" : "rgba(5,5,5,0.07)",
          overflow: "hidden",
        },
        style,
      ]}
    >
      {wash != null && <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: wash }} />}
      {children}
    </View>
  );
}

/**
 * Glass shapes that sit together, drawn as one material (one sampling of what is under them, so neighbours match).
 * `spacing` is how near two shapes must come before they start to melt into each other: 0 by default, so buttons a gap
 * apart stay apart at rest instead of joining in a blob. A plain row on platforms without Liquid Glass.
 */
export function GlassGroup({ children, spacing = 0, style }: { children: ReactNode; spacing?: number; style?: StyleProp<ViewStyle> }) {
  if (liquidGlass) return <GlassContainer spacing={spacing} style={style}>{children}</GlassContainer>;
  return <View style={style}>{children}</View>;
}

/** An SF Symbol on iOS, its Material twin on Android. */
export function Icon({
  ios,
  android,
  size = 20,
  color,
  weight,
}: {
  /** An SF Symbol name ("calendar", "chevron.left"). */
  ios: SFSymbol;
  /** A Material Symbols name ("today", "chevron_left"). */
  android?: AndroidSymbol;
  size?: number;
  color?: ColorValue;
  weight?: "regular" | "medium" | "semibold" | "bold";
}) {
  const c = useTheme();
  return (
    <SymbolView
      name={{ ios, android: android ?? "circle" }}
      size={size}
      tintColor={color ?? c.text1}
      weight={Platform.OS === "ios" ? weight : undefined}
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

/**
 * A round glass button holding a symbol (or `children`: the sync gauge, a photo): the header's actions, the day arrows.
 * Interactive glass with a selection tick. With no `onPress` (a sync under way) it holds still and says nothing.
 * Disabled, its symbol greys and the glass stops answering touch; the glass itself never fades (opacity breaks it).
 */
export function GlassIconButton({
  ios = "circle",
  android,
  onPress,
  label,
  size = 44,
  tint,
  color,
  disabled,
  busy,
  expanded,
  hint,
  children,
}: {
  /** An SF Symbol name; not needed when `children` draws the content. */
  ios?: SFSymbol;
  android?: AndroidSymbol;
  onPress?: () => void;
  label: string;
  disabled?: boolean;
  /** Working (a sync under way): screen readers say so. */
  busy?: boolean;
  /** For a button that opens and shuts something: whether it is open. */
  expanded?: boolean;
  hint?: string;
  size?: number;
  tint?: ColorValue;
  color?: ColorValue;
  /** Drawn instead of the symbol. */
  children?: ReactNode;
}) {
  const c = useTheme();
  const inert = disabled || !onPress;
  const press = usePressScale(0.92);
  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy, ...(expanded != null && { expanded }) }}
      disabled={inert}
      hitSlop={Math.max(6, (44 - size) / 2)}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
    >
      <Animated.View style={press.style}>
        <Glass tint={disabled ? undefined : tint} round={size / 2} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          {children ?? <Icon ios={ios} android={android} size={size * 0.42} color={disabled ? c.textDisabled : color} weight="semibold" />}
        </Glass>
      </Animated.View>
    </Pressable>
  );
}

/**
 * A glass capsule segmented control: the options in a row on Liquid Glass, the chosen one on a brighter lozenge that
 * slides across on a short ease (no spring). For two to five options.
 *
 * `size="md"` (44pt) fills its row, the options sharing it evenly: a setting, a page's filter. `size="sm"` (32pt, 44pt
 * to touch) is as wide as its labels and never grows: it sits beside a heading (a semester) without pushing the heading
 * out. `tint` paints the lozenge (a class's fill) and `on` is the chosen label's ink on it.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
  size = "md",
  tint,
  on,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** What the choice is, for screen readers ("Theme"). */
  label?: string;
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "md";
  tint?: string;
  on?: string;
}) {
  const c = useTheme();
  const sm = size === "sm";
  const pad = sm ? 3 : 4;
  const height = sm ? 26 : 36;
  // Where each option sits, measured: the lozenge takes the chosen one's place and width (options can differ).
  const [spots, setSpots] = useState<Partial<Record<T, { x: number; w: number }>>>({});
  const spot = spots[value];
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (!spot) return;
    // Its first place it is simply in; after that it slides.
    if (!placed.current) {
      placed.current = true;
      x.set(spot.x);
      w.set(spot.w);
    } else {
      // The morph spring, as the web's tab thumb (layoutId on spring.morph): a quick change of mind turns it round mid-way.
      x.set(reduced ? spot.x : withSpring(spot.x, springs.morph));
      w.set(reduced ? spot.w : withSpring(spot.w, springs.morph));
    }
  }, [spot, reduced, x, w]);
  const thumb = useAnimatedStyle(() => ({ width: w.get(), transform: [{ translateX: x.get() }] }));
  // Small, it keeps to its labels' width wherever it is put (the row around it sizes to it); medium fills its row.
  return (
    <View style={[{ flexDirection: "row", flexShrink: 0 }, !sm && { alignSelf: "stretch" }, style]}>
    <Glass round={radius.pill} style={{ padding: pad, flexGrow: sm ? 0 : 1 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row" }}>
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: radius.pill, borderCurve: "continuous" },
            { backgroundColor: tint ?? (c.dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.95)") },
            !c.dark && !tint && { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
            thumb,
          ]}
        />
        {options.map(o => {
          const chosen = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              hitSlop={sm ? { top: 6, bottom: 6 } : undefined}
              onLayout={(e: LayoutChangeEvent) => {
                const { x, width } = e.nativeEvent.layout;
                setSpots(m => (m[o.value]?.x === x && m[o.value]?.w === width ? m : { ...m, [o.value]: { x, w: width } }));
              }}
              onPress={() => {
                if (chosen) return;
                void Haptics.selectionAsync().catch(() => {});
                onChange(o.value);
              }}
              style={{ flex: sm ? undefined : 1, height, alignItems: "center", justifyContent: "center", paddingHorizontal: sm ? space[3] : space[2] }}
            >
              <Text
                variant="caption"
                color={chosen ? (tint ? (on ?? "#fff") : c.text1) : c.text2}
                style={{ fontWeight: chosen ? "600" : "500", fontSize: sm ? 13 : 14 }}
                numberOfLines={1}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Glass>
    </View>
  );
}

/**
 * A glass capsule you can press: a filter, a heading's action ("See all"), a "Today" pill. `selected` fills it with
 * `tint` (Neo blue by default). `icon` sits before the label, `trailing` after it (a chevron). As wide as its label: in
 * a column it keeps to the start. Disabled, its label greys and the glass stops answering; it never fades.
 */
export function GlassChip({
  label,
  onPress,
  selected,
  icon,
  trailing,
  tint,
  on,
  disabled,
  size = "md",
  style,
  accessibilityLabel,
  accessibilityHint,
  expanded,
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  tint?: ColorValue;
  /** "md" 44pt; "sm" 32pt to look at (44 to touch), for a heading's action ("See all") or a row's. */
  size?: "sm" | "md";
  /** The label's colour when selected: a class's own ink (`classColor(...).on`), dark on amber, lime, mint and sky. */
  on?: string;
  disabled?: boolean;
  /** Where it sits (a margin, `alignSelf`). */
  style?: StyleProp<ViewStyle>;
  /** Said instead of the label, where the label alone is short ("See all" for "See all your work"). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** For a chip that opens and shuts something ("Show all"): whether it is open. */
  expanded?: boolean;
}) {
  const c = useTheme();
  const sm = size === "sm";
  const press = usePressScale(0.95);
  return (
    <View style={[{ flexDirection: "row" }, style]}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected: !!selected, disabled: !!disabled, ...(expanded != null && { expanded }) }}
        disabled={disabled}
        hitSlop={sm ? 6 : 4}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          onPress?.();
        }}
      >
        <Animated.View style={press.style}>
          <Glass
            round={radius.pill}
            tint={disabled ? undefined : selected ? (tint ?? c.neo) : tint}
            style={{ minHeight: sm ? 32 : 44, paddingHorizontal: sm ? space[3] : space[4], flexDirection: "row", alignItems: "center", gap: sm ? space[1] : space[1.5] }}
          >
            {icon}
            <Text variant="caption" color={disabled ? c.textDisabled : selected ? (on ?? "#fff") : c.text1} style={{ fontWeight: "600", fontSize: sm ? 13 : 14 }}>
              {label}
            </Text>
            {trailing}
          </Glass>
        </Animated.View>
      </Pressable>
    </View>
  );
}
