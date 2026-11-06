import { View } from "react-native";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import type { Me } from "@/lib/session";
import { hostOf } from "@/lib/schools";
import { isRunning, useSyncRefresh, useSyncState, type SyncState } from "@/lib/sync";
import { ago, useNow } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, Rule } from "@/components/ui/card";
import { Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { Swap } from "@/features/grades/moving";
import { Face } from "./face";
import { useAskSignOut } from "./sign-out";

/** "Synced 3 minutes ago", "Partly synced 2 hours ago", "Syncing", "Not synced yet", as the web's sync button says. */
export function syncLabel(state: SyncState | null | undefined, now: number) {
  if (isRunning(state?.watched)) return "Syncing";
  const last = state?.last;
  if (!last?.finishedAt) return "Not synced yet";
  const partly = last.steps.some(s => s.status === "failed");
  return `${partly ? "Partly synced" : "Synced"} ${ago(last.finishedAt, now)}`;
}

/**
 * Who is signed in, where, and the last sync, with a sync now and the way out: the web's account card, which leads its
 * settings page (apps/web/app/features/settings/account.tsx). The photo, the full name and form group; under a hairline
 * the school, with the username and the school's Compass address (selectable, the one thing here a person might copy),
 * and when it last synced. The phone also asks for a sync by itself about once a minute while it is open
 * (lib/sync.ts useAutoSync), so Sync now is for when someone knows something has just changed; it spins until the run
 * it started has finished. Both are glass: Sync now clear, Sign out tinted coral, as the way out that can't be undone.
 * The sync line's words give way to the new ones in place ("Syncing", then "Synced just now").
 */
export function ProfileCard({ me, token }: { me: Me; token: string }) {
  const c = useTheme();
  const state = useSyncState(token);
  const now = useNow();
  const sync = useSyncRefresh(token);
  const signOut = useAskSignOut();
  const name = me.fullName ?? me.displayName;
  const syncing = sync.refreshing || isRunning(state?.watched);

  return (
    <Card panelStyle={{ gap: space[3] }}>
      <View accessible accessibilityLabel={`${name}${me.formGroup ? `, form ${me.formGroup}` : ""}`} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Face me={me} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="caption" tone="2">
            {me.formGroup ? `Form ${me.formGroup}` : me.username}
          </Text>
        </View>
      </View>

      <Rule />

      <View style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3] }}>
          <View style={{ width: 18, alignItems: "center", paddingTop: 1 }}>
            <Icon ios="graduationcap.fill" android="school" size={16} color={c.text2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 14 }}>
              {me.schoolName}
            </Text>
            <Text variant="caption" tone="2" selectable numberOfLines={1} accessibilityLabel={`Signed in as ${me.username} at ${hostOf(me.slug)}`}>
              {me.username} · {hostOf(me.slug)}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <View style={{ width: 18, alignItems: "center" }}>
            <Icon ios="arrow.triangle.2.circlepath" android="sync" size={15} color={c.text2} />
          </View>
          <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
            <Swap id={syncLabel(state, now)}>
              <Text variant="caption" tone="2">
                {syncLabel(state, now)}
              </Text>
            </Swap>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: space[2] }}>
        <Button size="sm" variant="secondary" pending={syncing} pendingLabel="Syncing" onPress={() => void sync.refresh()} style={{ flex: 1 }}>
          Sync now
        </Button>
        <Button size="sm" variant="danger" pending={signOut.pending} pendingLabel="Signing out" onPress={signOut.ask} style={{ flex: 1 }}>
          Sign out
        </Button>
      </View>
    </Card>
  );
}
