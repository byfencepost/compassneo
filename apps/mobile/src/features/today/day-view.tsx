import { useEffect, useState, type ReactNode } from "react";
import { View, type DimensionValue } from "react-native";
import Animated, {
  Easing,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { dayName, isWeekend, weekdayOf } from "@/lib/days";
import { keysOf, type Lesson, type ReadyDay } from "@/lib/timetable";
import { focusIn, rise, springs } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Block } from "./block";
import { layDay, nextSchoolDay, type Laid } from "./day";
import { Glyph, type GlyphName } from "./glyph";
import { dayEntering, dayExiting } from "./motion";
import { DaySwipe } from "./swipe";

/** A day still not here after this long gets a word about it, instead of a skeleton that never ends. */
const SLOW = 15_000;

type Props = {
  dayKey: string;
  today: string;
  shown: { day: ReadyDay | null; loading: boolean };
  now: number;
  zone: string;
  /** Which way the day last moved: the new one slides in from that side. */
  dir: -1 | 0 | 1;
  /** Opens a lesson's class. Without it (a guest's day, features/guest), the lessons are only read. */
  onOpen?: (l: Lesson) => void;
  onMove: (by: -1 | 1) => void;
  onGoTo: (day: string) => void;
};

/**
 * One school day, under a swipe that turns it, as the web's day view moves. Each day is its own view (with its own
 * swipe), so turning to another lets the old one go (a quick fade where it stands) and brings the new one a short way
 * in from the side you went, on the panel spring, while the room they sit in glides to the new day's height. A day
 * holding glass (a note's button) never fades: it is gone at once, and the next only slides (see ./motion).
 *
 * Inside a day, nothing moves on its first paint: a day already here simply arrives with the turn. What comes after it
 * (the classes landing where the skeleton breathed, a lesson changing place as the clock moves, a note) comes into
 * view where it sits; every re-render, sync and refresh in between leaves it be.
 */
export function DayView(props: Props) {
  const { dayKey, today, shown, now, dir, onMove } = props;
  const day = shown.day;
  const laid = day?.lessons.length ? layDay(day, keysOf(day.lessons, dayKey), now, dayKey === today) : null;
  // Only a note with an action carries glass: today's classes over, or a weekend.
  const glass = laid ? laid.over : !!day && isWeekend(day.day);
  return (
    <Glide>
      <Animated.View key={dayKey} entering={dayEntering(dir, glass)} exiting={dayExiting(glass)}>
        <DaySwipe onMove={onMove} style={{ gap: space[2] }}>
          <LayoutAnimationConfig skipEntering>
            <DayBody {...props} laid={laid} />
          </LayoutAnimationConfig>
        </DaySwipe>
      </Animated.View>
    </Glide>
  );
}

/** The screen's side margin (components/ui/screen.tsx), which the day's clip reaches out over. */
const EDGE = space[4];

/**
 * The day's room on the page, as the web's day view has it: its height springs to each new day's (the morph spring of
 * the kit's `glide`), so what is under it moves smoothly instead of jumping, and what is taller than it so far is
 * clipped until there is room. The clip reaches out to the screen's edges, so a day sliding in or dragged aside is
 * never cut short of them. The first height is taken as it is; with Reduce Motion, every one is.
 */
function Glide({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const height = useSharedValue(-1);
  const box = useAnimatedStyle(() => {
    const h = height.get();
    return h < 0 ? {} : { height: h };
  });
  return (
    <Animated.View style={[{ overflow: "hidden", marginHorizontal: -EDGE }, box]}>
      <View
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          height.set(height.get() < 0 || still ? h : withSpring(h, springs.morph));
        }}
        style={{ paddingHorizontal: EDGE }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function DayBody({ dayKey, today, shown, now, zone, onOpen, onGoTo, laid }: Props & { laid: Laid | null }) {
  const day = shown.day;
  const isToday = dayKey === today;

  if (!day) return <Waiting />;

  if (!laid) return <NoClasses day={day} today={today} onGoTo={onGoTo} />;

  const next = nextSchoolDay(today);
  return (
    <>
      {laid.over && (
        <Note
          glyph="done"
          title="That's today's classes done"
          body={`${dayName(next, today)}'s timetable is a tap away.`}
          action={{ label: `See ${dayName(next, today)}`, onPress: () => onGoTo(next) }}
        />
      )}
      <Block cells={laid.cells} now={now} isToday={isToday} zone={zone} onOpen={onOpen} />
    </>
  );
}

/** A note arriving after its day did: one with a glass button rises into place; one without comes into focus. */
const NOTE_IN = { glass: rise(), plain: focusIn() } as const;

/**
 * A word about the day, as the web's day notice has it: a glyph in Neo blue, a line, a hint under it and an action (a
 * small glass button), in a card of its own. Compact: one row, never a big empty state.
 */
function Note({ glyph, title, body, action }: { glyph: GlyphName; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const c = useTheme();
  return (
    <Animated.View entering={NOTE_IN[action ? "glass" : "plain"]}>
      <Card padded={false}>
        <View accessible={!action} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: 14 }}>
          <Glyph name={glyph} size={24} color={c.neoText} weight="regular" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="label" style={{ fontWeight: "600" }}>
              {title}
            </Text>
            <Text variant="bodySm" tone="2" style={{ marginTop: 2 }}>
              {body}
            </Text>
            {action && (
              <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
                <Button variant="secondary" size="sm" onPress={action.onPress}>
                  {action.label}
                </Button>
              </View>
            )}
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

/**
 * Nothing on the timetable. A weekend says so and offers the next school day; a weekday names what Compass has on its
 * calendar instead, if anything (a public holiday, a pupil-free day), else the likely reasons.
 */
function NoClasses({ day, today, onGoTo }: { day: ReadyDay; today: string; onGoTo: (day: string) => void }) {
  const weekend = isWeekend(day.day);
  const onCalendar = [...new Set(day.events.filter(e => e.allDay).map(e => e.title.trim()).filter(Boolean))];
  const next = nextSchoolDay(day.day);
  return (
    <Note
      glyph="noClasses"
      title={weekend ? `No classes, it's ${weekdayOf(day.day)}` : "No classes on this day"}
      body={
        weekend
          ? "Enjoy the weekend."
          : onCalendar.length
            ? `Compass has ${onCalendar.join(", ")} on the calendar.`
            : "Compass has nothing on your timetable: a holiday, a pupil-free day, or exams."
      }
      action={weekend ? { label: `See ${dayName(next, today)}`, onPress: () => onGoTo(next) } : undefined}
    />
  );
}

/**
 * The day still on its way: the shape of the day's block (a hero, two rows, a pair of tiles), breathing slowly. One
 * that takes too long says so and how to ask again, rather than breathing for ever.
 */
function Waiting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW);
    return () => clearTimeout(t);
  }, []);
  if (slow) return <Note glyph="waiting" title="Compass is taking its time" body="This day has not come through yet. Pull down to ask again, or try another day." />;
  return (
    <View accessible accessibilityLabel="Getting this day from Compass" accessibilityRole="progressbar">
      <Card padded={false}>
        <Breathing>
          <View style={{ paddingHorizontal: space[4], paddingTop: 14, paddingBottom: space[4], gap: space[2] }}>
            <Bone width={96} height={12} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <Bone width={22} height={22} round={11} />
              <Bone width="46%" height={24} round={7} />
              <Bone width={44} height={24} round={8} />
            </View>
            <Bone width={170} height={16} />
          </View>
          {[0, 1].map(i => (
            <Band key={i}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space[4], height: 52 }}>
                <Bone width={16} height={16} round={8} />
                <Bone width={`${34 - i * 8}%`} height={14} />
                <Bone width={30} height={16} round={6} />
                <View style={{ marginLeft: "auto" }}>
                  <Bone width={70} height={11} />
                </View>
              </View>
            </Band>
          ))}
          <Band>
            <View style={{ flexDirection: "row", height: 58 }}>
              {[0, 1].map(i => (
                <TileBone key={i} side={i === 1} />
              ))}
            </View>
          </Band>
        </Breathing>
      </Card>
    </View>
  );
}

/** A band of the skeleton under the hairline the real block draws between cells. */
function Band({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>{children}</View>;
}

function TileBone({ side }: { side: boolean }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: space[1.5], paddingHorizontal: space[4], borderLeftWidth: side ? 1 : 0, borderLeftColor: c.line }}>
      <Bone width="62%" height={13} />
      <Bone width="48%" height={10} />
    </View>
  );
}

/** A grey block standing in for text still on its way, in the field grey the web's skeletons use. */
function Bone({ width, height, round = 5 }: { width: DimensionValue; height: number; round?: number }) {
  const c = useTheme();
  return <View style={{ width, height, borderRadius: round, backgroundColor: c.field }} />;
}

/** A slow fade between two strengths, so a skeleton reads as on its way rather than broken. Still, for reduced motion. */
function Breathing({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!still) o.set(withRepeat(withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [still, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
