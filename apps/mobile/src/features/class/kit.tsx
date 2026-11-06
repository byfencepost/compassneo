import { Children, createContext, Fragment, isValidElement, useContext, useEffect, useState, type ReactNode } from "react";
import { Pressable, View, type AccessibilityState, type TextStyle, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { LayoutAnimationConfig, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Card, Rule } from "@/components/ui/card";
import { Chevron, Fold as KitFold } from "@/components/ui/fold";
import { GlassChip, Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { dur, rise } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { classColor, HUES, radius, space, type ClassColor } from "@/theme/tokens";
import { Glyph, type GlyphName } from "./glyph";

/**
 * The class screen's building blocks, after the web's class panel (apps/web/app/features/class/sections.tsx and
 * kit.tsx): a labelled card per answer, rows split by hairlines, rows that open in place. The cards and rows are content,
 * drawn the web's way; every action on them ("All grades", "Show 4 more") is Liquid Glass from the app's kit
 * (components/ui/glass.tsx). Motion is the app's own (theme/motion.ts, the web's vocabulary): quick, settling, never a
 * bounce, and only on a real change: a block arrives with a short rise when its data lands, never when its section
 * arrives with it. The class's colour reaches every piece through ClassHue, so a glyph picks it up without being handed
 * it.
 */

// ---------- the class's colour ----------

const HueContext = createContext<number | null>(null);

export function ClassHue({ hue, children }: { hue: number | null; children: ReactNode }) {
  return <HueContext.Provider value={hue}>{children}</HueContext.Provider>;
}

/** The class's colours in the theme in use (Neo blue until the class is known). */
export function useHue(): ClassColor {
  return classColor(useContext(HueContext), useTheme());
}

/**
 * The class's colour as a solid that white text reads on: the fill itself, or for the light hues (amber, lime, mint,
 * sky, whose own ink is dark) their deeper shade.
 */
export function useSolid(): string {
  const hue = useContext(HueContext);
  const c = useTheme();
  const h = hue != null ? HUES[((hue % HUES.length) + HUES.length) % HUES.length] : undefined;
  if (!h) return c.neo;
  return h.on === "#fff" ? h.fill : h.light;
}

/** The figure a card leads with (a lesson's time, the grade): 22pt semibold in even digits, as the web's. */
export const FIGURE: TextStyle = { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3, fontVariant: ["tabular-nums"] };

// ---------- pressing ----------

export const tick = () => void Haptics.selectionAsync().catch(() => {});

/**
 * A row you can press, with a selection tick. Its children read `pressed` to wash grey, as a list row does; it never
 * shrinks or fades (it is content: the class screen's controls are the kit's glass).
 */
export function Press({
  onPress,
  children,
  label,
  hint,
  role = "button",
  state,
}: {
  onPress: () => void;
  children: (p: { pressed: boolean }) => ReactNode;
  label?: string;
  hint?: string;
  role?: "button" | "link";
  state?: AccessibilityState;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={state}
      onPress={() => {
        tick();
        onPress();
      }}
    >
      {({ pressed }) => children({ pressed })}
    </Pressable>
  );
}

/**
 * What a row or a folded section holds, and the chevron that turns as it opens: the app's one fold
 * (components/ui/fold.tsx), so every dropdown on the class page moves as every other in the app does. What it holds is
 * simply there as it opens (the fold is the motion); only what changes inside it afterwards (a hand-in going in, a page's
 * text landing) has an arrival of its own.
 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <KitFold open={open}>
      <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
    </KitFold>
  );
}
export { Chevron };

// ---------- blocks and rows ----------

/**
 * A quiet action in a card's foot ("Show 4 more"): a small glass chip, sat in the card's own padding. 32pt to look at,
 * 44pt to touch.
 */
export function FootChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={{ paddingHorizontal: space[4], paddingVertical: space[3], alignItems: "flex-start" }}>
      <GlassChip size="sm" label={label} onPress={onPress} />
    </View>
  );
}

/**
 * A labelled card: the label sits above it, outside, so every block is plainly its own thing, with the glyph in the
 * class's colour. `aside` sits at the label's end (a small segmented control); `onMore` puts a small glass chip there
 * that opens the tab with the whole of it, named by `moreLabel` ("All grades"). The label keeps its room: it takes
 * what the row has left and truncates, and what sits beside it never grows. The card is the app's own (a grey shell, a
 * paper panel inside), as on the web. Landing after its section (its data come in), it rises into place, `index` steps
 * down the page; a move only, as the label's chip is glass.
 */
export function Block({
  glyph,
  title,
  aside,
  onMore,
  moreLabel,
  children,
  padded,
  index = 0,
}: {
  glyph: GlyphName;
  title: string;
  aside?: ReactNode;
  onMore?: () => void;
  /** The chip's words, short: "All grades". */
  moreLabel?: string;
  children: ReactNode;
  /** The card's panel pads its content (a paragraph); rows bring their own padding. */
  padded?: boolean;
  /** Its place among the blocks arriving together, for their stagger. */
  index?: number;
}) {
  const c = useTheme();
  const hue = useHue();
  return (
    <Animated.View entering={rise(index)} style={{ gap: space[1.5] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], minHeight: 32, paddingLeft: space[1] }}>
        <Glyph name={glyph} size={15} color={hue.accent} />
        <Text variant="label" accessibilityRole="header" style={{ flex: 1, minWidth: 0, fontWeight: "600" }} numberOfLines={1}>
          {title}
        </Text>
        {aside ? <View style={{ flexShrink: 0 }}>{aside}</View> : null}
        {onMore && (
          <View style={{ flexShrink: 0 }}>
            <GlassChip size="sm" label={moreLabel ?? "More"} onPress={onMore} trailing={<Icon ios="chevron.right" android="chevron_right" size={10} color={c.text2} weight="semibold" />} />
          </View>
        )}
      </View>
      <Card padded={!!padded}>{children}</Card>
    </Animated.View>
  );
}

/** Children with a hairline between each (nulls and falses left out), as rows sit in a card. */
export function Divided({ children, inset = 0 }: { children: ReactNode; inset?: number }) {
  const items = Children.toArray(children).filter(isValidElement);
  return items.map((child, i) => (
    <Fragment key={child.key ?? i}>
      {i > 0 && <Rule inset={inset} />}
      {child}
    </Fragment>
  ));
}

/** A row's padding inside a card, at least a touch target tall. */
export const ROW: ViewStyle = { paddingHorizontal: space[4], paddingVertical: space[3], minHeight: 48, justifyContent: "center" };

/**
 * A row that opens in place to show more under it (a notice's text, a lesson's plan). Without a body it is a plain
 * row. Pressed, it washes grey, as a list row does; it never shrinks.
 */
export function OpenRow({ head, body, label, dim }: { head: ReactNode; body: ReactNode | null; label: string; dim?: boolean }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  if (!body)
    return (
      <View accessible accessibilityLabel={label} style={[ROW, dim && { opacity: 0.55 }]}>
        {head}
      </View>
    );
  return (
    <View>
      <Press onPress={() => setOpen(!open)} label={label} state={{ expanded: open }}>
        {({ pressed }) => (
          <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[2] }, pressed && { backgroundColor: c.lineFaint }, dim && { opacity: 0.55 }]}>
            <View style={{ flex: 1 }}>{head}</View>
            <Chevron open={open} />
          </View>
        )}
      </Press>
      <Fold open={open}>
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>{body}</View>
      </Fold>
    </View>
  );
}

/**
 * A secondary list tucked away: one card whose first row names it (with a count) and opens it. For lists worth keeping
 * that should never lead (work handed in, lesson plans). It arrives as a Block does.
 */
export function FoldBlock({
  glyph,
  title,
  count,
  open,
  onToggle,
  children,
  index = 0,
}: {
  glyph: GlyphName;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  index?: number;
}) {
  const c = useTheme();
  const hue = useHue();
  return (
    <Animated.View entering={rise(index)}>
      <Card padded={false}>
        <Press onPress={onToggle} label={`${title}${count != null ? `, ${count}` : ""}`} state={{ expanded: open }}>
          {({ pressed }) => (
            <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[2] }, pressed && { backgroundColor: c.lineFaint }]}>
              <Glyph name={glyph} size={15} color={hue.accent} />
              <Text variant="label" style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>
                {title}
              </Text>
              {count != null && (
                <Text variant="label" tone="3" style={{ fontVariant: ["tabular-nums"] }}>
                  {count}
                </Text>
              )}
              <Chevron open={open} />
            </View>
          )}
        </Press>
        <Fold open={open}>
          <Rule />
          {children}
        </Fold>
      </Card>
    </Animated.View>
  );
}

/**
 * Something that is not a Block landing with the rest (a row of figures, a line that says all is clear): the same short
 * rise, a move only, so it may hold glass.
 */
export function Arrive({ index = 0, children }: { index?: number; children: ReactNode }) {
  return <Animated.View entering={rise(index)}>{children}</Animated.View>;
}

// ---------- loading ----------

/**
 * A block still on its way: its label and a card of bars the heights the real rows will have, breathing gently (holding
 * still with Reduce Motion).
 */
export function SkeletonBlock({ rows }: { rows: number[] }) {
  const c = useTheme();
  const still = useReducedMotion();
  const glow = useSharedValue(still ? 1 : 0.55);
  useEffect(() => {
    if (still) return;
    glow.set(withRepeat(withSequence(withTiming(1, { duration: dur.open }), withTiming(0.55, { duration: dur.open })), -1));
  }, [glow, still]);
  const anim = useAnimatedStyle(() => ({ opacity: glow.get() }));
  // Only the bars breathe, as the web's skeletons do: the card holds still around them.
  return (
    <View style={{ gap: space[1.5] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: space[1.5], height: 32, paddingLeft: space[1] }, anim]}>
        <View style={{ width: 15, height: 15, borderRadius: radius.pill, backgroundColor: c.field }} />
        <View style={{ width: 84, height: 12, borderRadius: 6, backgroundColor: c.field }} />
      </Animated.View>
      <Card>
        <Animated.View style={[{ gap: space[3] }, anim]}>
          {rows.map((h, i) => (
            <View key={i} style={{ height: h, borderRadius: 6, backgroundColor: c.field, opacity: 1 - i * 0.15 }} />
          ))}
        </Animated.View>
      </Card>
    </View>
  );
}
