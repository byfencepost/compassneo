import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text as RNText, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import Svg, { Circle, G } from "react-native-svg";
import { Card, Rule } from "@/components/ui/card";
import { Chevron, Fold } from "@/components/ui/fold";
import { Skeleton } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { Arrive, Swap } from "@/features/grades/moving";
import { ago } from "@/lib/time";
import { dur, ease, focusIn, glide, springs, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { radius, space } from "@/theme/tokens";
import { tabular } from "./format";
import { Glyph, type GlyphName } from "./glyph";

/**
 * The pieces the student pages are built from, in the web's manner (apps/web/app/features/student/parts.tsx): a
 * labelled section over one card of rows split by hairlines, rows that open in place, and sections that fold. Opening
 * and shutting is the app's one Fold (components/ui/fold.tsx): a short ease, never a spring. The pages' controls (the
 * segmented filters, the "Get … now" buttons) are the shared Liquid Glass kit's (components/ui/glass.tsx, button.tsx).
 */

/** A row's padding inside a card, as the web's (px-3.5 py-2.5). */
export const ROW_X = 14;
export const ROW_Y = 10;

const tick = () => void Haptics.selectionAsync().catch(() => {});

/** A section's name: its glyph in the page's colour, the name, and anything at its end (a figure, "95% so far"). */
export function SectionHead({ glyph, title, accent, aside }: { glyph: GlyphName; title: string; accent: string; aside?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], paddingHorizontal: space[1], minHeight: 24 }}>
      <Glyph name={glyph} size={15} color={accent} />
      <Text variant="label" accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {aside != null && <View style={{ marginLeft: "auto", flexShrink: 0, paddingLeft: space[2] }}>{aside}</View>}
    </View>
  );
}

/**
 * A labelled card: the name above it, outside, then the card. Its rows bring their own hairlines (Divided). Given
 * `arrive` (its place among the page's sections), it arrives as the page does (Arrive): into focus, or rising when it
 * holds `glass`.
 */
export function Section({
  glyph,
  title,
  accent,
  aside,
  children,
  panelStyle,
  arrive,
  glass,
}: {
  glyph: GlyphName;
  title: string;
  accent: string;
  aside?: ReactNode;
  children: ReactNode;
  panelStyle?: StyleProp<ViewStyle>;
  arrive?: number;
  glass?: boolean;
}) {
  const body = (
    <>
      <SectionHead glyph={glyph} title={title} accent={accent} aside={aside} />
      <Card padded={false} panelStyle={panelStyle}>
        {children}
      </Card>
    </>
  );
  if (arrive == null) return <View style={{ gap: space[2] }}>{body}</View>;
  return (
    <Arrive index={arrive} glass={glass} style={{ gap: space[2] }}>
      {body}
    </Arrive>
  );
}

/**
 * Rows with a hairline between each (none above the first). `glides` is for a list whose rows change under it (a
 * term picked instead of the year): a row moved glides to its new place, and one that wasn't there comes into focus;
 * the rows there at first simply are (the section around them arrives). Never for rows that grow in place (a GrowRow):
 * the rows under one would trail behind it as it opens.
 */
export function Divided({ children, glides }: { children: ReactNode; glides?: boolean }) {
  const rows = Children.toArray(children).filter(isValidElement);
  // The rows there at first, by key: they arrive with their section, so only a row new since comes into focus. (Not a
  // LayoutAnimationConfig: that would hold back everything inside the rows too, the bars growing in among them.)
  const [first] = useState(() => new Set(rows.map((row, i) => row.key ?? i)));
  if (!glides)
    return rows.map((row, i) => (
      <View key={row.key ?? i}>
        {i > 0 && <Rule />}
        {row}
      </View>
    ));
  return rows.map((row, i) => (
    <Animated.View key={row.key ?? i} layout={glide} entering={first.has(row.key ?? i) ? undefined : focusIn()}>
      {i > 0 && <Rule />}
      {row}
    </Animated.View>
  ));
}

/** A plain row in a card. */
export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: ROW_X, paddingVertical: ROW_Y }, style]}>{children}</View>;
}

/**
 * A row that grows in place to say more. Shut, it is a title and a one-line preview; opened, the title and preview
 * run to their full length and the rest of it (more) folds out under them, so nothing is said twice. Without more it
 * is a plain row with nothing to press.
 */
export function GrowRow({
  lead,
  title,
  titleGlyph,
  preview,
  more,
  aside,
  dim,
  label,
}: {
  lead: ReactNode;
  title: string;
  /** A small glyph before the title (an event's kind). */
  titleGlyph?: ReactNode;
  preview?: ReactNode;
  more?: ReactNode;
  aside?: ReactNode;
  dim?: boolean;
  /** What a screen reader says for the row, when its parts read badly together. */
  label?: string;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const body = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
          {titleGlyph}
          <Text variant="label" tone={dim ? "2" : "1"} numberOfLines={open ? undefined : 1} style={{ flex: 1 }}>
            {title}
          </Text>
        </View>
        {preview != null && (
          <Text variant="caption" tone={dim ? "3" : "2"} numberOfLines={open ? undefined : 1} style={tabular}>
            {preview}
          </Text>
        )}
        {more != null && <Fold open={open}>{more}</Fold>}
      </View>
      {aside}
    </>
  );
  const style: ViewStyle = { flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingHorizontal: ROW_X, paddingVertical: ROW_Y };
  if (!more)
    return (
      <View style={style} accessible={!!label} accessibilityLabel={label}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      // Opened, a screen reader reads the row as it now stands (all of it), not the short label.
      accessibilityLabel={open ? undefined : label}
      accessibilityState={{ expanded: open }}
      onPress={() => {
        tick();
        setOpen(o => !o);
      }}
      style={({ pressed }) => [style, pressed && { backgroundColor: c.lineFaint }]}
    >
      {body}
      <View style={{ paddingTop: 3 }}>
        <Chevron open={open} />
      </View>
    </Pressable>
  );
}

/** The last row of a card, which folds more rows out under itself ("Other classes and activities"). */
export function FoldMore({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Rule />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${count}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          tick();
          setOpen(o => !o);
        }}
        style={({ pressed }) => [
          { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: ROW_X, paddingVertical: ROW_Y },
          pressed && { backgroundColor: c.lineFaint },
        ]}
      >
        <Text variant="caption" tone="2" numberOfLines={1} style={{ flex: 1, fontWeight: "500" }}>
          {label}
        </Text>
        <Text variant="caption" tone="3" style={[tabular, { fontWeight: "500" }]}>
          {count}
        </Text>
        <Chevron open={open} />
      </Pressable>
      <Fold open={open}>
        <Rule />
        {children}
      </Fold>
    </>
  );
}

/** A section that folds away under its name (an earlier year), the name itself the button. */
export function FoldSection({
  glyph,
  title,
  accent,
  count,
  defaultOpen = false,
  children,
}: {
  glyph: GlyphName;
  title: string;
  accent: string;
  count?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count ? `${title}, ${count}` : title}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          tick();
          setOpen(o => !o);
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <SectionHead
          glyph={glyph}
          title={title}
          accent={accent}
          aside={
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              {count != null && (
                <Text variant="caption" tone="3" style={[tabular, { fontWeight: "500" }]}>
                  {count}
                </Text>
              )}
              <Chevron open={open} />
            </View>
          }
        />
      </Pressable>
      <Fold open={open}>
        <View style={{ paddingTop: space[2] }}>{children}</View>
      </Fold>
    </View>
  );
}

/**
 * A card that says why there is nothing, or what there is instead: a glyph, a line, a sentence, maybe an action (a
 * small glass Button, "Get attendance now"). The card is content; only its action is glass.
 */
export function Notice({ glyph, accent, title, body, action }: { glyph: GlyphName; accent: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3] }}>
        <View style={{ paddingTop: 1 }}>
          <Glyph name={glyph} size={20} color={accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{title}</Text>
          {body != null && (
            <Text variant="bodySm" tone="2">
              {body}
            </Text>
          )}
          {action != null && <View style={{ marginTop: space[2], alignSelf: "flex-start" }}>{action}</View>}
        </View>
      </View>
    </Card>
  );
}

/** One quiet line on the page itself, not in a card: a glyph and a sentence ("Nothing coming up"). */
export function Line({ glyph, children, color }: { glyph: GlyphName; children: ReactNode; color?: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[1] }}>
      <Glyph name={glyph} size={14} color={color ?? c.text3} />
      <Text variant="bodySm" tone="2" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * When the page's data was last fetched, at its foot ("Updated 5 minutes ago"), or that it is being fetched now: the
 * words give way to the new ones in place.
 */
export function Updated({ at, refreshing, now }: { at: number | undefined; refreshing: boolean; now: number }) {
  if (!refreshing && at == null) return null;
  const text = refreshing ? "Getting the latest" : `Updated ${ago(at!, now)}`;
  return (
    <Swap id={text}>
      <Text variant="caption" tone="3" style={{ textAlign: "center" }}>
        {text}
      </Text>
    </Swap>
  );
}

// ---------- figures ----------

const R = 42;
const C = 2 * Math.PI * R;
const Arc = Animated.createAnimatedComponent(Circle);
/** The arc drawing itself in, the first time: a screen's content arriving (the long settle, no overshoot). */
const DRAW = { duration: dur.open, easing: ease.settle };

/**
 * A share as a ring in its status colour, drawn round from twelve o'clock as it arrives (after `delay`) and moving to
 * a new share from the old one (a term picked instead of the year): the settling ease, never a spring, and simply there
 * for anyone who has asked their phone for less motion. Only a picture: what it sits in says the figure.
 */
export function Ring({
  percent,
  color,
  size = 48,
  thickness = 11,
  delay = 0,
}: {
  percent: number;
  color: ColorValue;
  size?: number;
  thickness?: number;
  delay?: number;
}) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const p = Math.max(0, Math.min(100, percent));
  const progress = useSharedValue(reduced ? p : 0);
  const drawn = useRef(false);
  useEffect(() => {
    if (reduced) progress.set(p);
    else progress.set(drawn.current ? withTiming(p, timing.settle) : withDelay(delay, withTiming(p, DRAW)));
    drawn.current = true;
  }, [p, reduced, progress, delay]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - progress.get() / 100) }));
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Circle cx={50} cy={50} r={R} fill="none" stroke={c.field} strokeWidth={thickness} />
        {p > 0 && (
          <G rotation={-90} origin="50, 50">
            <Arc cx={50} cy={50} r={R} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={[C, C]} animatedProps={arc} />
          </G>
        )}
      </Svg>
    </View>
  );
}

/** A bar growing in from its start, once, as the web's does (scaleX from 0 on spring.morph). */
const grow: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { transform: [{ scaleX: 0 }] },
    animations: { transform: [{ scaleX: withSpring(1, springs.morph) }] },
  };
};

/**
 * A stacked bar: each part's share in its colour on a pill track. `scale` shortens the whole bar against its
 * neighbours (a term still under way). A part never shrinks under 3pt, so one absence in a hundred rolls still shows.
 * It grows in from its start once, as it arrives; when its shares change (another term picked), each part glides to
 * its new length.
 */
export function Bar({ parts, scale = 1, style }: { parts: { value: number; color: string }[]; scale?: number; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  // Each part keeps its key (its place among all the parts) when a share before it falls to nothing, so it glides
  // rather than taking another's colour. Renamed from `value`: Reanimated's Babel plugin warns about any `x.value` in
  // an inline style, taking it for a shared value.
  const shown = parts.map((part, at) => ({ share: part.value, color: part.color, at })).filter(part => part.share > 0);
  return (
    <View accessible={false} style={[{ height: 6, borderRadius: radius.pill, backgroundColor: c.field, overflow: "hidden" }, style]}>
      <Animated.View
        entering={grow}
        layout={glide}
        style={{ flexDirection: "row", height: "100%", width: `${Math.max(0, Math.min(1, scale)) * 100}%`, gap: 1, transformOrigin: "left" }}
      >
        {shown.map(({ share, color, at }) => (
          <Animated.View key={at} layout={glide} style={{ flexGrow: share, flexShrink: 1, flexBasis: 0, minWidth: 3, backgroundColor: color }} />
        ))}
      </Animated.View>
    </View>
  );
}

/** A mark's swatch in a key or beside a day: a small rounded square in its colour (an outline for "not marked"). */
export function Swatch({ color, hollow }: { color: string; hollow?: boolean }) {
  const c = useTheme();
  return <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: hollow ? "transparent" : color, borderWidth: hollow ? 1 : 0, borderColor: c.line }} />;
}

/** A section on its way: its label and a card of bars as tall as the rows coming. */
export function SkeletonSection({ rows }: { rows: number[] }) {
  return (
    <View accessible={false} style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], paddingHorizontal: space[1], minHeight: 24 }}>
        <Skeleton height={14} width={14} round={7} />
        <Skeleton height={13} width={84} />
      </View>
      <Card panelStyle={{ gap: space[3] }}>
        {rows.map((h, i) => (
          <Skeleton key={i} height={h} />
        ))}
      </Card>
    </View>
  );
}

/** A page on its way: a few skeleton sections, said once to a screen reader. */
export function Loading({ label, sections }: { label: string; sections: number[][] }) {
  return (
    <View accessible accessibilityLabel={label} style={{ gap: space[5] }}>
      {sections.map((rows, i) => (
        <SkeletonSection key={i} rows={rows} />
      ))}
    </View>
  );
}

// ---------- people and words ----------

function initials(name: string) {
  const words = name.replace(/\s*\([^)]*\)/g, "").replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return ((words[0]![0] ?? "") + (words.length > 1 ? (words[words.length - 1]![0] ?? "") : "")).toUpperCase();
}

/** A staff member's photo in a circle, their initials until it loads (or when Compass has none). Only a picture. */
export function Face({ name, photoUrl, size = 26 }: { name: string; photoUrl?: string | null; size?: number }) {
  const c = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const photo = photoUrl && failed !== photoUrl ? photoUrl : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.field, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
    >
      <Text variant="caption" tone="2" style={{ fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: "600" }}>
        {initials(name)}
      </Text>
      {photo && (
        <Image
          source={{ uri: photo }}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
          onError={() => setFailed(photo)}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

const URL_IN_TEXT = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Text a teacher wrote, its bare web addresses made links (opened in the in-app browser). Nest it in a Text. */
export function Linked({ text }: { text: string }) {
  const c = useTheme();
  const parts = text.split(URL_IN_TEXT);
  return parts.map((part, i) =>
    i % 2 ? (
      <RNText
        key={i}
        accessibilityRole="link"
        onPress={() => {
          tick();
          WebBrowser.openBrowserAsync(part, { controlsColor: c.neo, toolbarColor: c.page, dismissButtonStyle: "done" }).catch(() =>
            Linking.openURL(part).catch(() => {}),
          );
        }}
        style={{ color: c.neoText, textDecorationLine: "underline" }}
      >
        {part}
      </RNText>
    ) : (
      part
    ),
  );
}
