import { Pressable } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import type { Me } from "@/lib/session";
import { GlassIconButton } from "@/components/ui/glass";
import { Face } from "./face";

/** A glass circle of its own (the sync gauge's size beside it), and the photo inside it: a ring of glass shows round. */
const BOX = 40;
/** The bare square in a navigation bar, as the sync gauge's: the bar draws its own glass around it, as a ring. */
const BARE = 36;
const FACE = 32;

/**
 * The student's photo, the web's profile picture in the corner (apps/web/app/features/home/profile.tsx): their Compass
 * photo, else their initials on Neo blue. Pressing it opens settings.
 *
 * On home it is an item of the native navigation bar, so it is drawn bare (`glass={false}`): on iOS 26 the bar sets its
 * own Liquid Glass round it, and glass on glass reads as two. Bare, it may dim under the finger (it sits inside the
 * bar's glass, never around any). With `glass` it sits in a round of the kit's glass instead, for over content, and the
 * glass answers the finger itself (its shimmer and squash).
 */
export function ProfileButton({ me, glass = true }: { me: Me; glass?: boolean }) {
  const label = `${me.displayName}, settings`;
  const open = () => router.push("/settings");
  if (glass)
    return (
      <GlassIconButton ios="person.crop.circle.fill" android="account_circle" size={BOX} label={label} hint="Opens settings" onPress={open}>
        <Face me={me} size={FACE} />
      </GlassIconButton>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens settings"
      hitSlop={4}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        open();
      }}
      style={({ pressed }) => ({ width: BARE, height: BARE, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.55 : 1 })}
    >
      <Face me={me} size={FACE} />
    </Pressable>
  );
}
