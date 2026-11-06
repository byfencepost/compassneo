import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { focusIn, focusOut, rise } from "@/theme/motion";

/**
 * Two small movers the student's pages share (grades, to do, notices, attendance, events, Chronicle, settings), on the
 * app's motion (theme/motion.ts). Neither is ever put around Liquid Glass in a way that fades it: Swap fades, so it
 * holds words and figures only; Arrive rises instead of fading when told that what it holds has glass in it.
 */

/**
 * A page's section (or a card on home) arriving: it comes into focus where it sits, the page's sections a beat apart
 * (`index`). One that holds glass (a segmented control, a glass chip) rises into place instead, with no fade. It plays
 * when it mounts, so only when the section first appears, never on a re-render or a sync.
 */
export function Arrive({ index = 0, glass, style, children }: { index?: number; glass?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View entering={glass ? rise(index) : focusIn(index)} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * Words or a figure that change in place ("Synced 2 minutes ago" becoming "Syncing", 87% becoming 88%): the old fades
 * out as the new comes into focus where it sat. Only on a change: what is there when it first appears is simply there
 * (it arrives with whatever holds it), and when the whole of it goes, it goes at once. `id` is what it shows, so a
 * render with the same words does nothing. Never around glass: it fades.
 */
export function Swap({ id, style, children }: { id: string | number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <Animated.View key={id} entering={focusIn()} exiting={focusOut()} style={style}>
        {children}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}
