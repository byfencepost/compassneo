import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useEndGuest } from "@/lib/guest";
import type { Me } from "@/lib/session";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Face } from "@/features/me/face";

/**
 * The banner over a guest's day (features/guest/guest-home.tsx), held at the top of the screen while their day
 * scrolls under it: who is signed in as a guest, and Sign out, one press with nothing asked, which hands the phone
 * straight back to its own student. A content card like any other; its one control is the kit's glass, tinted coral as
 * every way out is.
 */
export function GuestBanner({ me }: { me: Me }) {
  const c = useTheme();
  const inset = useSafeAreaInsets();
  const end = useEndGuest();
  const name = me.fullName ?? me.displayName;
  const where = me.formGroup ? `Form ${me.formGroup} · ${me.schoolName}` : me.schoolName;
  return (
    <View style={{ paddingTop: inset.top + space[2], paddingHorizontal: space[4], paddingBottom: space[2], backgroundColor: c.page }}>
      <Card padded={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: space[3], paddingRight: space[2], paddingVertical: space[2] }}>
          <View accessible accessibilityLabel={`Guest mode, ${name}, ${where}`} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[3] }}>
            <Face me={me} size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="overline" color={c.neoText}>
                Guest mode
              </Text>
              <Text variant="label" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" tone="2" numberOfLines={1}>
                {where}
              </Text>
            </View>
          </View>
          <Button
            size="sm"
            variant="danger"
            accessibilityHint="Signs the guest out and goes back to this phone's own timetable"
            onPress={() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              end();
            }}
          >
            Sign out
          </Button>
        </View>
      </Card>
    </View>
  );
}
