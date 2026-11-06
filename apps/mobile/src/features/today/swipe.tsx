import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { dur } from "@/theme/motion";
import { timings } from "./motion";

/** How far a swipe has to travel, or how fast, to turn the day (the web's numbers, apps/web/app/routes/home.tsx). */
const SWIPE_PX = 70;
const SWIPE_SPEED = 500;
/** How much of the finger's travel the day follows: enough to feel held, not so much it looks loose. */
const FOLLOW = 0.42;

/**
 * One day under a horizontal swipe: it follows the finger a little (moving only, never fading: the day can hold glass,
 * see ./motion), and a swipe far or fast enough turns the day (left for the next, right for the one before). Let go
 * of, it slides back flat, with no spring. A day that turns stays where the finger left it as it goes, so the next one
 * (a view of its own, with a swipe of its own) is what moves in: nothing drifts back the wrong way first. Vertical
 * movement fails the gesture at once, so the page still scrolls and presses still land. The drag runs on the UI
 * thread; only the turn crosses to React.
 */
export function DaySwipe({ onMove, style, children }: { onMove: (by: -1 | 1) => void; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const drag = useSharedValue(0);
  const turned = useSharedValue(false);
  const pan = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onUpdate: e => {
      "worklet";
      drag.set(e.translationX * FOLLOW);
    },
    onDeactivate: e => {
      "worklet";
      const by: -1 | 0 | 1 = e.translationX < -SWIPE_PX || e.velocityX < -SWIPE_SPEED ? 1 : e.translationX > SWIPE_PX || e.velocityX > SWIPE_SPEED ? -1 : 0;
      const turn = by !== 0 && !e.canceled;
      turned.set(turn);
      if (turn) scheduleOnRN(onMove, by);
    },
    onFinalize: () => {
      "worklet";
      // A turned day is gone long before the wait is up; the slide back is only for one somehow still here.
      const back = withTiming(0, timings.settle);
      drag.set(turned.get() ? withDelay(dur.morph, back) : back);
      turned.set(false);
    },
  });
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: drag.get() }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, follow]}>{children}</Animated.View>
    </GestureDetector>
  );
}
