import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, type ScrollViewInstance } from "react-native";
import Animated, { LayoutAnimationConfig, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, type EntryExitAnimationFunction } from "react-native-reanimated";
import { Glass } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { springs } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { radius, space } from "@/theme/tokens";
import { tick, useHue } from "./kit";

export type TabId = "overview" | "grades" | "work" | "files" | "lessons";

export const TAB_ORDER: TabId[] = ["overview", "grades", "work", "files", "lessons"];
export const TAB_LABEL: Record<TabId, string> = { overview: "Overview", grades: "Grades", work: "Work", files: "Files", lessons: "Lessons" };

export const isTab = (x: unknown): x is TabId => typeof x === "string" && (TAB_ORDER as string[]).includes(x);

/** The capsule's padding (the thumb's inset) and a tab's height: 44pt in all, as the kit's segmented control. */
const INSET = 4;
const HEIGHT = 36;

type Spot = { x: number; w: number };

/**
 * The class's sections as a Liquid Glass capsule the width of the page (the kit's segmented control, made to scroll):
 * every section named, the open one on a lozenge in the class's colour that glides between them on the morph spring (on
 * its first frame it is simply there). The tabs share the capsule; when their names will not fit (large text), it scrolls sideways inside
 * the glass and keeps the open one in view.
 */
export function Tabs({ tabs, value, onChange }: { tabs: TabId[]; value: TabId; onChange: (id: TabId) => void }) {
  const c = useTheme();
  const hue = useHue();
  const scroll = useRef<ScrollViewInstance>(null);
  const [frame, setFrame] = useState({ view: 0, content: 0 });
  // Where each tab sits, measured: the thumb takes the open one's place and width (the names differ).
  const [spots, setSpots] = useState<Partial<Record<TabId, Spot>>>({});
  const spot = spots[value];
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);
  const still = useReducedMotion();

  // Its first place it is simply in; after that it glides there on the morph spring, as the kit's segmented control and
  // the web's tab thumb do, so a quick change of mind turns it round mid-way. With Reduce Motion it moves at once.
  useEffect(() => {
    if (!spot) return;
    if (!placed.current || still) {
      placed.current = true;
      x.set(spot.x);
      w.set(spot.w);
      return;
    }
    x.set(withSpring(spot.x, springs.morph));
    w.set(withSpring(spot.w, springs.morph));
  }, [spot, x, w, still]);

  // The open tab stays in view when the capsule scrolls: centred, where there is room either side.
  useEffect(() => {
    if (!spot || frame.content <= frame.view + 1) return;
    const to = Math.max(0, Math.min(frame.content - frame.view, INSET + spot.x + spot.w / 2 - frame.view / 2));
    scroll.current?.scrollTo({ x: to, animated: true });
  }, [spot, frame]);

  const thumb = useAnimatedStyle(() => ({ width: w.get(), transform: [{ translateX: x.get() }] }));

  return (
    <Glass round={radius.pill}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={frame.content > frame.view + 1}
        contentContainerStyle={{ flexGrow: 1, padding: INSET }}
        onLayout={e => {
          const view = e.nativeEvent.layout.width;
          setFrame(f => (f.view === view ? f : { ...f, view }));
        }}
        onContentSizeChange={content => setFrame(f => (f.content === content ? f : { ...f, content }))}
        accessibilityRole="tablist"
        accessibilityLabel="Class sections"
      >
        <View style={{ flexDirection: "row", flexGrow: 1 }}>
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: radius.pill, borderCurve: "continuous", backgroundColor: hue.fill }, thumb]}
          />
          {tabs.map(id => {
            const on = id === value;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onLayout={e => {
                  const { x, width } = e.nativeEvent.layout;
                  setSpots(s => (s[id]?.x === x && s[id]?.w === width ? s : { ...s, [id]: { x, w: width } }));
                }}
                onPress={() => {
                  if (on) return;
                  tick();
                  onChange(id);
                }}
                style={{ flexGrow: 1, height: HEIGHT, paddingHorizontal: space[2] + 2, alignItems: "center", justifyContent: "center" }}
              >
                {({ pressed }) => (
                  <Text variant="label" color={on ? hue.on : pressed ? c.text1 : c.text2} style={{ fontSize: 14, lineHeight: 19, fontWeight: "600" }} numberOfLines={1}>
                    {TAB_LABEL[id]}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Glass>
  );
}

// ---------- the open section ----------

/** How far a section starts from where it lands, as the web's class panel turns its pages: enough to say which way. */
const TURN = 28;

/** A section arriving from the side of the tab moved toward, on the morph spring. A move only: sections hold glass. */
const turnIn = (dir: -1 | 1): EntryExitAnimationFunction => () => {
  "worklet";
  return {
    initialValues: { transform: [{ translateX: dir * TURN }] },
    animations: { transform: [{ translateX: withSpring(0, springs.morph) }] },
  };
};
const TURN_IN = { [-1]: turnIn(-1), 1: turnIn(1) } as const;

/**
 * The open section, as the web's class panel turns between them (AnimatePresence with the way it went): a section
 * picked to the right comes in a short way from the right, one to the left from the left, and the one left goes at once,
 * so the new one is what the eye follows. Nothing fades: most sections hold Liquid Glass (a chip, the semester switch,
 * the search field), and glass under a fading parent loses its look. The first section is simply there.
 *
 * What a section holds is simply there when the section arrives (it arrives as one); what comes into it afterwards (its
 * data landing, a hand-in going in) has its own arrival.
 */
export function TabPage({ tab, children }: { tab: TabId; children: ReactNode }) {
  const [last, setLast] = useState(tab);
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  if (tab !== last) {
    setLast(tab);
    setDir(TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(last) ? 1 : -1);
  }
  return (
    <Animated.View key={tab} entering={dir ? TURN_IN[dir] : undefined} style={{ gap: space[4], marginTop: space[1] }}>
      <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
    </Animated.View>
  );
}
