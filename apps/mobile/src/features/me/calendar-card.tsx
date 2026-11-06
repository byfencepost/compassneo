import { useState } from "react";
import { Alert, Platform, Share, View } from "react-native";
import Animated from "react-native-reanimated";
import * as Linking from "expo-linking";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@compassneo/backend/api";
import { signOutNotice } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { SettingHead } from "./head";

/** The same link for the phone's calendar to open: webcal:// asks it to subscribe rather than download. */
const webcalOf = (url: string) => url.replace(/^https?:/, "webcal:");

/**
 * The calendar feed (convex/calendar.ts), as the web's settings page has it (apps/web/app/features/settings/
 * calendar-feed.tsx), and nowhere more at home than on the phone it is for. Off: a way to turn it on. On: a way to add
 * it to the phone's calendar (which subscribes to webcal://), the link to share elsewhere, and a way to turn it off,
 * which ends the link, so it asks first (turning it on again makes a new one). Every one of those is a glass button.
 */
export function CalendarCard({ token }: { token: string }) {
  const c = useTheme();
  const link = useQuery(api.calendar.link, { token });
  const enable = useAction(api.calendar.enable);
  const disable = useMutation(api.calendar.disable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!link) return null;
  const url = link.url;

  const turnOn = () => {
    setBusy(true);
    setError(null);
    void enable({ token })
      .then(r => {
        if (r.ok) return;
        if (r.code === "signed-out" || r.code === "password-changed") signOutNotice.set(r.message);
        else setError(r.message);
      })
      .catch(() => setError("That did not work. Try again."))
      .finally(() => setBusy(false));
  };
  const turnOff = () =>
    Alert.alert("Turn off the link?", "Calendars using it stop updating, and turning it on again makes a new link.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Turn off link",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void disable({ token })
            .catch(() => {})
            .finally(() => setBusy(false));
        },
      },
    ]);
  const add = (u: string) => {
    setError(null);
    Linking.openURL(webcalOf(u)).catch(() => setError("No calendar on this phone would take it. Share the link instead."));
  };
  // iOS shares a URL as a link (the sheet offers Copy and the calendar apps); Android shares it as text.
  const share = (u: string) => void Share.share(Platform.OS === "ios" ? { url: u } : { message: u }).catch(() => {});

  return (
    <Card panelStyle={{ gap: space[3] }}>
      <SettingHead
        ios="calendar"
        android="calendar_month"
        title="Calendar"
        caption={url ? "A link your calendar subscribes to, with your timetable, assemblies and due dates." : "Put your timetable, assemblies and due dates in your phone's calendar."}
      >
        {error && (
          // A problem comes into focus under the caption (words only: the buttons below are glass and stay put).
          <Animated.View key={error} entering={focusIn()}>
            <Text variant="caption" tone="warn" accessibilityLiveRegion="polite" style={{ marginTop: 2 }}>
              {error}
            </Text>
          </Animated.View>
        )}
      </SettingHead>

      {url ? (
        <>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <Button size="sm" variant="secondary" icon={<Icon ios="plus" android="add" size={13} color={c.text1} weight="semibold" />} onPress={() => add(url)} style={{ flex: 1 }}>
              Add to calendar
            </Button>
            <Button size="sm" variant="secondary" icon={<Icon ios="square.and.arrow.up" android="share" size={13} color={c.text1} weight="semibold" />} onPress={() => share(url)} style={{ flex: 1 }}>
              Share link
            </Button>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Text variant="caption" tone="3" style={{ flex: 1 }}>
              Anyone with the link can see your timetable.
            </Text>
            <Button size="sm" variant="secondary" pending={busy} pendingLabel="Turning off" onPress={turnOff}>
              Turn off
            </Button>
          </View>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          pending={busy}
          pendingLabel="Making a link"
          icon={<Icon ios="calendar.badge.plus" android="calendar_add_on" size={13} color={c.text1} weight="semibold" />}
          onPress={turnOn}
        >
          Get a calendar link
        </Button>
      )}
    </Card>
  );
}
