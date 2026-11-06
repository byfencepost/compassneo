import { useLayoutEffect, useMemo, useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from "expo-router";
import { NeoMark } from "@/components/brand/logo";
import type { Me } from "@/lib/session";
import { space } from "@/theme/tokens";
import { ProfileButton } from "@/features/me/profile-button";
import { SyncGauge } from "@/features/sync/sync-gauge";

/**
 * Home's top bar, as the web's header (apps/web/app/routes/home.tsx), drawn by the native navigation bar itself: the
 * Neo mark on the left, plain, which goes back to today, and on the right the sync gauge and the student's photo, which
 * opens settings. No title, no date (the day says which day it is). Returns the options for home's `Stack.Screen`,
 * kept the same object while the student and their token are: a new object sets the header again. It shows the bar
 * too, which a guest's home (features/guest) hides.
 *
 * On iOS the three are the bar's own items. On iOS 26 the bar is see-through Liquid Glass (the root layout's), home's
 * scroll fading out softly under it, and iOS draws the items' glass: the gauge and the photo are drawn bare inside it,
 * each its own glass circle (the fixed space between them splits the bar's shared glass in two, as iOS groups apart
 * controls that don't belong together), and the mark hides its glass (`hidesSharedBackground`), a logo, not a button
 * in a pill. On Android (and iOS before 26) a solid bar on the page colour holds the same three, bare.
 */
export function useTopBar({ me, token, onToday }: { me: Me; token: string; onToday: () => void }): NativeStackNavigationOptions {
  // The bar is set once; the press reaches home's latest idea of today through this.
  const today = useRef(onToday);
  useLayoutEffect(() => {
    today.current = onToday;
  });
  return useMemo(() => {
    const mark = <Mark onPress={() => today.current()} />;
    const gauge = <SyncGauge token={token} glass={false} />;
    const photo = <ProfileButton me={me} glass={false} />;
    if (Platform.OS === "ios") {
      const left: NativeStackHeaderItem[] = [{ type: "custom", element: mark, hidesSharedBackground: true }];
      // Listed from the left: the photo ends up at the bar's trailing edge.
      const right: NativeStackHeaderItem[] = [
        { type: "custom", element: gauge },
        { type: "spacing", spacing: 0 },
        { type: "custom", element: photo },
      ];
      return { headerShown: true, unstable_headerLeftItems: () => left, unstable_headerRightItems: () => right };
    }
    return {
      headerShown: true,
      headerLeft: () => mark,
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          {gauge}
          {photo}
        </View>
      ),
    };
  }, [me, token]);
}

/** The Neo mark, which goes back to today. It is not glass, so it may dim under the finger. */
function Mark({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Compass Neo, go to today"
      onPress={onPress}
      hitSlop={9}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <NeoMark size={26} />
    </Pressable>
  );
}
