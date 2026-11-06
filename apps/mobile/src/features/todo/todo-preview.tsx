import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated from "react-native-reanimated";
import { glide } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { persisted, useStored } from "@/lib/store";
import { Card, Rule } from "@/components/ui/card";
import { Chevron, Fold } from "@/components/ui/fold";
import { GlassChip, GlassIconButton, Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { tabular } from "@/features/grades/data";
import { AllCaughtUp, TodoRow, TodoRowsSkeleton } from "./todo-row";
import { freshen, useTodo } from "./data";

/** Rows on home at most: the most pressing few. The rest are a press away, on /todo. */
const SHOWN = 3;

/**
 * Whether the section is open, kept on this device. Folded until opened, as on the web (cneo.todo.open there too): the
 * heading already says how much there is and how much of it is overdue.
 */
const openStore = persisted<boolean>("cneo.todo.open.v1", false);

/** The fold's glass toggle: a small round one, the height of the heading's "See all". */
const TOGGLE = 32;

/**
 * What's to do, minimized on home under the grades, from the web's to-do list (apps/web/app/features/home/todo-list.tsx):
 * a heading with how much there is and how much of it is overdue, and under it the most pressing few rows (every
 * overdue piece first, then by when it is due), each opening its class on its Work. It folds as the classes below it
 * do (features/home/class-list.tsx): the heading presses, and a small round glass toggle at its end turns its chevron;
 * folded at first, as on the web, and remembered on the device. "See all", a small glass chip beside the toggle, opens
 * the whole list whether the section is open or shut. With nothing to do it says so in one quiet row, so the section
 * never comes and goes between syncs; before Compass's tasks are first synced it is not shown.
 *
 * Opened, the rows come into focus one after another; while open, a piece handed in (or a new one) moves the rest, and
 * they glide to their places.
 */
export function TodoPreview({ token, today, zone, now }: { token: string; today: string; zone: string; now: number }) {
  const c = useTheme();
  const todo = useTodo(token);
  const open = useStored(openStore);
  if (todo === null || (todo && !todo.synced)) return null;
  const items = todo ? freshen(todo.items, now) : null;
  const count = items?.length ?? 0;
  const overdue = items?.filter(i => i.overdue).length ?? 0;
  const go = (code: string) => router.push({ pathname: "/class/[code]", params: { code, tab: "work" } });
  // The glass toggle ticks on its own; the heading's words, pressed, tick here.
  const flip = () => openStore.set(!open);
  const said = [
    "To do",
    count > 0 && `${count} ${count === 1 ? "piece" : "pieces"} of work`,
    overdue > 0 && `${overdue} overdue`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View>
      {/* Drawn as a Section's heading (components/ui/screen.tsx). The toggle is the glass button; the rest of the
          heading presses too, as a bigger target, without dimming (it holds glass) and without a second voice. */}
      <Pressable
        accessible={false}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          flip();
        }}
        style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[1], minHeight: 24 }}
      >
        <View accessible accessibilityRole="header" accessibilityLabel={said} style={{ flexDirection: "row", gap: space[1.5], flexShrink: 1 }}>
          <Text variant="overline" tone="2">
            To do
          </Text>
          {count > 0 && (
            <Text variant="overline" tone="3" style={tabular}>
              {count}
            </Text>
          )}
          {overdue > 0 && (
            <Text variant="overline" tone="warn" numberOfLines={1} style={[tabular, { flexShrink: 1 }]}>
              {`${overdue} overdue`}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }} />
        <GlassChip
          size="sm"
          label="See all"
          accessibilityLabel="See all your work"
          trailing={<Icon ios="chevron.right" android="chevron_right" size={10} color={c.text2} weight="semibold" />}
          onPress={() => router.push("/todo")}
        />
        <GlassIconButton ios="chevron.down" android="expand_more" size={TOGGLE} label={open ? "Hide your work" : "Show your work"} expanded={open} onPress={flip}>
          <Chevron open={open} color={c.text2} />
        </GlassIconButton>
      </Pressable>
      {/* The gap under the heading folds with the list, so nothing jumps when it has shut. */}
      <Fold open={open}>
        <View style={{ marginTop: space[2] }}>
          {!items ? (
            <TodoRowsSkeleton />
          ) : !items.length ? (
            <AllCaughtUp />
          ) : (
            <Card padded={false}>
              {items.slice(0, SHOWN).map((item, i) => (
                <Animated.View key={item.key} layout={glide}>
                  {i > 0 && <Rule />}
                  <TodoRow item={item} zone={zone} today={today} onOpen={go} index={i} />
                </Animated.View>
              ))}
            </Card>
          )}
        </View>
      </Fold>
    </View>
  );
}
