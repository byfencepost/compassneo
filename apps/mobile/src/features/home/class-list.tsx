import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Card, Rule } from "@/components/ui/card";
import { Chevron, Fold } from "@/components/ui/fold";
import { GlassIconButton } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { clock, dayIn, dayName } from "@/lib/days";
import { persisted, useStored } from "@/lib/store";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { Ring } from "@/features/grades/ring";
import { SubjectGlyph } from "@/features/grades/subject-glyph";
import { gradeTone } from "@/features/today/day";
import { Face } from "@/features/today/parts";
import { Press } from "@/features/today/press";
import { nextOf, useClassList, type ListedClass } from "./classes";

/**
 * Whether the list is open, kept on this device. Folded until opened, as on the web: the day above already shows the
 * classes on it.
 */
const openStore = persisted<boolean>("cneo.classlist.open.v1", false);

const tabular = { fontVariant: ["tabular-nums" as const] };

/** The fold's glass toggle: a small round one, the height of a heading's chip. */
const TOGGLE = 32;

/**
 * Every class the student takes, under the to-do list, as the web's list on home (apps/web/app/features/home/class-list.tsx):
 * minimized to its heading ("Classes", how many) until opened, then one block of hairline rows, each with the class's
 * glyph in its colour, its name, its teacher, when it is next on and this semester's grade. A small round glass button
 * at the heading's end folds it, its chevron turning (the heading's words fold it too). A row opens the class's page,
 * whether or not it is on the day being looked at.
 *
 * Opened, the rows come into focus where they sit, a beat apart from the top, as the fold makes room for them; a list
 * already open when the page arrives is simply there.
 */
export function ClassList({ token, day, today, zone, now }: { token: string; day: string; today: string; zone: string; now: number }) {
  const c = useTheme();
  const classes = useClassList(token, day);
  const open = useStored(openStore);
  // Whether the list has been opened here, by a press, rather than found open.
  const [opened, setOpened] = useState(false);
  if (!classes?.length) return null;

  // The glass button ticks on its own; the heading's words, pressed, tick here.
  const flip = () => {
    if (!open) setOpened(true);
    openStore.set(!open);
  };

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
        style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], paddingHorizontal: space[1], minHeight: 24 }}
      >
        <View accessible accessibilityRole="header" accessibilityLabel={`Classes, ${classes.length}`} style={{ flexDirection: "row", gap: space[1.5] }}>
          <Text variant="overline" tone="2">
            Classes
          </Text>
          {!open && (
            <Text variant="overline" tone="3" style={tabular}>
              {classes.length}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }} />
        <GlassIconButton ios="chevron.down" android="expand_more" size={TOGGLE} label={open ? "Hide classes" : `Show ${classes.length} classes`} onPress={flip}>
          <Chevron open={open} color={c.text2} />
        </GlassIconButton>
      </Pressable>
      {/* The gap under the heading folds with the list, so nothing jumps when it has shut. */}
      <Fold open={open}>
        <Card padded={false} style={{ marginTop: space[2] }}>
          {classes.map((cls, i) => (
            <Animated.View key={cls.code} entering={opened ? focusIn(i) : undefined}>
              {i > 0 && <Rule />}
              <ClassRow cls={cls} today={today} zone={zone} now={now} />
            </Animated.View>
          ))}
        </Card>
      </Fold>
    </View>
  );
}

/** A class as one row: its glyph in its colour, name, teacher with their face, when it is next on, the grade's ring. */
function ClassRow({ cls: k, today, zone, now }: { cls: ListedClass; today: string; zone: string; now: number }) {
  const c = useTheme();
  const tint = classColor(k.hue, c);
  const next = nextOf(k, now);
  const when = next ? `${dayName(dayIn(zone, next.start), today)} ${clock(next.start, zone)}` : null;
  const percent = k.grade?.percent ?? null;
  const teacher = k.teacher ? (k.teacher.full ?? k.teacher.name) : null;
  const ring = percent != null ? { ok: c.ok, neo: c.neo, warn: c.warn, fail: c.fail }[gradeTone(percent)] : null;
  const label = [k.name, teacher, when ? `next ${when}` : null, percent != null ? `grade ${Math.round(percent)} percent` : null].filter(Boolean).join(", ");

  return (
    <Press
      label={label}
      hint="Opens the class"
      onPress={() => router.push({ pathname: "/class/[code]", params: { code: k.code } })}
      style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 52, paddingHorizontal: 14, paddingVertical: space[1.5] }}
    >
      <SubjectGlyph names={[k.subject, k.name, k.code]} color={tint.accent} size={16} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {k.name}
        </Text>
        {k.teacher && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
            <Face person={k.teacher} size={14} />
            <Text variant="caption" tone="3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {teacher}
            </Text>
          </View>
        )}
      </View>
      {when && (
        <Text variant="caption" tone="3" style={[tabular, { flexShrink: 0 }]} numberOfLines={1}>
          {when}
        </Text>
      )}
      {/* Only a class with a grade has the ring's slot: one without (homeroom) ends at its time, no gap. */}
      {ring && (
        <View style={{ width: 28, alignItems: "center", flexShrink: 0 }}>
          <Ring percent={percent} color={ring} size={24} thickness={16} />
        </View>
      )}
    </Press>
  );
}
