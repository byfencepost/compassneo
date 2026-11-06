import { router } from "expo-router";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/glass";
import { SettingHead } from "./head";

/**
 * Guest mode, under who is signed in on Settings: lends the phone to a friend to check their own timetable, the
 * student staying signed in underneath (features/guest). The way in is a clear glass button; the way out is the
 * banner over the guest's day.
 */
export function GuestCard() {
  const c = useTheme();
  return (
    <Card panelStyle={{ gap: space[3] }}>
      <SettingHead ios="person.2.fill" android="group" title="Guest mode" caption="Let a friend check their timetable on this phone. You stay signed in." />
      <Button
        size="sm"
        variant="secondary"
        icon={<Icon ios="person.badge.plus" android="person_add" size={13} color={c.text1} weight="semibold" />}
        onPress={() => router.push("/guest")}
        style={{ alignSelf: "flex-start" }}
      >
        Start guest mode
      </Button>
    </Card>
  );
}
