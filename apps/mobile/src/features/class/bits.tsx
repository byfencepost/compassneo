import { useEffect, useRef, useState } from "react";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Text as RNText, View } from "react-native";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Text } from "@/components/ui/text";
import { ago } from "@/lib/time";
import { dur, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { alpha, HUES, radius, space, type Palette } from "@/theme/tokens";
import { SOURCE, type Person, type PlanBlock, type SideState, type Source, type WorkState } from "./data";
import type { Kind } from "./files";
import { Glyph, type GlyphName } from "./glyph";
import { tick } from "./kit";

/**
 * The smaller things the class screen shows in many places: a teacher's face, a lesson plan's text, where a piece of
 * work stands, which side something came from, and the line that says a side is still on its way.
 */

// ---------- opening things ----------

/**
 * Opens a file or a page in the in-app browser (SFSafariViewController, Chrome Custom Tabs), in the app's colours. A
 * Compass Neo file link carries its own credential (convex/lib/links.ts), so the browser needs no sign-in. If the
 * browser will not come up, the system opens it instead. The caller gives the haptic (a Button already has its own).
 */
export function useOpen() {
  const c = useTheme();
  return (url: string) => {
    WebBrowser.openBrowserAsync(url, { controlsColor: c.neo, toolbarColor: c.page, dismissButtonStyle: "done", enableBarCollapsing: true }).catch(() =>
      Linking.openURL(url).catch(() => {}),
    );
  };
}

// ---------- text a teacher wrote ----------

const URL_IN_TEXT = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Text with its bare web addresses made links, as Compass's own view shows them. Nested in a Text, so it wraps with it. */
export function Linked({ text }: { text: string }) {
  const c = useTheme();
  const open = useOpen();
  const parts = text.split(URL_IN_TEXT);
  return parts.map((part, i) =>
    i % 2 ? (
      <RNText
        key={i}
        accessibilityRole="link"
        onPress={() => {
          tick();
          open(part);
        }}
        style={{ color: c.neoText, textDecorationLine: "underline" }}>
        {part}
      </RNText>
    ) : (
      part
    ),
  );
}

/**
 * A lesson plan or a task's instructions as its teacher wrote it: paragraphs and bulleted lists, bold, italics and links
 * kept. The server has already turned the HTML into plain blocks (convex/lib/plan.ts), so nothing of it is run here.
 */
export function PlanText({ blocks }: { blocks: PlanBlock[] }) {
  const c = useTheme();
  const open = useOpen();
  // Items next to each other make one list.
  const groups: { kind: "p" | "li"; blocks: PlanBlock[] }[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.kind === "li" && last?.kind === "li") last.blocks.push(b);
    else groups.push({ kind: b.kind, blocks: [b] });
  }
  const runs = (b: PlanBlock) =>
    b.runs.map((r, i) => {
      const style = [r.b && { fontWeight: "600" as const, color: c.text1 }, r.i && { fontStyle: "italic" as const }];
      return r.href ? (
        <RNText
          key={i}
          accessibilityRole="link"
          onPress={() => {
            tick();
            open(r.href!);
          }}
          style={[style, { color: c.neoText, textDecorationLine: "underline" }]}>
          {r.t}
        </RNText>
      ) : (
        <RNText key={i} style={style}>
          <Linked text={r.t} />
        </RNText>
      );
    });
  return (
    <View style={{ gap: space[2] }}>
      {groups.map((g, i) =>
        g.kind === "li" ? (
          <View key={i} style={{ gap: space[1] }}>
            {g.blocks.map((b, j) => (
              <View key={j} style={{ flexDirection: "row", gap: space[2], paddingLeft: space[1] }}>
                <Text variant="bodySm" tone="3">
                  •
                </Text>
                <Text variant="bodySm" tone="2" style={{ flex: 1 }} selectable>
                  {runs(b)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={i} variant="bodySm" tone="2" selectable>
            {runs(g.blocks[0]!)}
          </Text>
        ),
      )}
    </View>
  );
}

// ---------- people ----------

function initials(p: Person) {
  const words = (p.full ?? p.name).replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return ((words[0]![0] ?? "") + (words.length > 1 ? (words[words.length - 1]![0] ?? "") : "")).toUpperCase();
}

/** A teacher's photo in a circle, their initials until it loads (or when Compass has none). */
export function TeacherFace({ person, size = 28, ring }: { person: Person; size?: number; ring?: string }) {
  const c = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const photo = person.photoUrl && failed !== person.photoUrl ? person.photoUrl : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.field,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      <Text variant="caption" tone="2" style={{ fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: "600" }}>
        {initials(person)}
      </Text>
      {photo && (
        <Image
          source={{ uri: photo }}
          contentFit="cover"
          transition={dur.state}
          cachePolicy="memory-disk"
          onError={() => setFailed(photo)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
    </View>
  );
}

// ---------- where work stands ----------

type Tone = "neutral" | "neo" | "ok" | "warn" | "fail";

const toneColors = (tone: Tone, c: Palette) =>
  ({
    neutral: { bg: c.field, fg: c.text2 },
    neo: { bg: alpha(c.neo, c.dark ? 0.18 : 0.12), fg: c.neoText },
    ok: { bg: c.okTint, fg: c.okText },
    warn: { bg: c.warnTint, fg: c.warnText },
    fail: { bg: c.failTint, fg: c.failText },
  })[tone];

const STATE: Record<WorkState, { label: string; glyph: GlyphName; tone: Tone }> = {
  todo: { label: "To do", glyph: "todo", tone: "neo" },
  overdue: { label: "Overdue", glyph: "overdue", tone: "fail" },
  submitted: { label: "Handed in", glyph: "check", tone: "ok" },
  late: { label: "Handed in late", glyph: "check", tone: "warn" },
  closed: { label: "Closed", glyph: "lock", tone: "neutral" },
  none: { label: "No hand-in", glyph: "info", tone: "neutral" },
};

export const stateLabel = (s: WorkState) => STATE[s].label;

/** A small pill with a glyph: where a piece of work stands, a mark's place in its class. */
export function Pill({ label, glyph, tone }: { label: string; glyph?: GlyphName; tone: Tone }) {
  const c = useTheme();
  const { bg, fg } = toneColors(tone, c);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 3 }}>
      {glyph && <Glyph name={glyph} size={11} color={fg} />}
      <Text variant="caption" color={fg} style={{ fontWeight: "600" }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StateChip({ state }: { state: WorkState }) {
  const s = STATE[state];
  return <Pill label={s.label} glyph={s.glyph} tone={s.tone} />;
}

/** Where something came from, as a quiet word: shown only where more than one side is in the same list. */
export function SourceTag({ source }: { source: Source }) {
  return (
    <Text variant="caption" tone="3" style={{ fontWeight: "500" }} accessibilityLabel={`From ${SOURCE[source]}`}>
      {SOURCE[source]}
    </Text>
  );
}

/** A kind of file's glyph in the kind's own hue, so a Word file and a PDF tell apart at a glance. */
export function KindGlyph({ kind, size = 18 }: { kind: Kind; size?: number }) {
  const c = useTheme();
  const h = kind.hue != null ? HUES[kind.hue] : null;
  return <Glyph name={kind.glyph} size={size} color={h ? (c.dark ? h.dark : h.light) : c.text2} />;
}

// ---------- each side's state ----------

/**
 * One quiet line per side that is not plainly there: still on its way, refused, or kept from an earlier fetch because
 * the last one failed. Nothing at all when every side is fine.
 */
export function SideNotes({ sides, what, now }: { sides: [Source, SideState][]; what: Record<Source, string>; now: number }) {
  const c = useTheme();
  const lines = sides.flatMap(([source, side]): { source: Source; glyph: GlyphName; color: string; text: string }[] => {
    if (side.status === "missing") return [{ source, glyph: "pending", color: c.neoText, text: `Getting ${what[source]} from ${SOURCE[source]}` }];
    if (side.status === "unavailable") return [{ source, glyph: "warning", color: c.warnText, text: `${SOURCE[source]}: ${side.reason}` }];
    if (side.status === "ready" && side.error)
      return [{ source, glyph: "warning", color: c.warnText, text: `${SOURCE[source]} did not answer just now, so this is from ${ago(side.fetchedAt, now)}.` }];
    return [];
  });
  if (!lines.length) return null;
  return (
    <View style={{ gap: space[1.5], paddingHorizontal: space[1] }} accessibilityLiveRegion="polite">
      {lines.map(l => (
        <View key={l.source} style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
          <Glyph name={l.glyph} size={13} color={l.color} style={{ marginTop: 2 }} />
          <Text variant="caption" tone="2" style={{ flex: 1 }}>
            {l.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------- a bar ----------

/**
 * A thin bar filled to a share, in a colour (a lesson's progress, a mark, a semester, an upload), growing to it as it
 * appears (after `delay`, a list's stagger) and easing on to each new share as it changes, on the settling curve: fast,
 * then a slow settle, nothing past where it lands. With Reduce Motion it is simply there.
 */
export function Meter({ value, color, height = 6, delay = 0 }: { value: number; color: string; height?: number; delay?: number }) {
  const c = useTheme();
  const still = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  const fill = useSharedValue(still ? v : 0);
  const grown = useRef(false);
  useEffect(() => {
    if (still) {
      fill.set(v);
      return;
    }
    // Only its first growth waits for its turn in a list; a share changing after (an upload ticking on) moves at once.
    const to = withTiming(v, timing.settle);
    fill.set(grown.current ? to : withDelay(delay, to));
    grown.current = true;
  }, [v, delay, fill, still]);
  const anim = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: c.line, overflow: "hidden" }}>
      <Animated.View style={[{ minWidth: v > 0 ? height : 0, height, borderRadius: height / 2, backgroundColor: color }, anim]} />
    </View>
  );
}
