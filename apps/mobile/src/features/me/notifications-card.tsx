import { Fragment, useState } from "react";
import { Platform, Switch, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { pushSupport, turnOff, turnOn, usePushPermission, type PushSupport } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Card, Rule } from "@/components/ui/card";
import { Fold } from "@/components/ui/fold";
import { Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { SettingHead } from "./head";

type Prefs = NonNullable<FunctionReturnType<typeof api.push.prefs>>;
type Kind = keyof Prefs;

const KINDS: { kind: Kind; title: string; caption: string }[] = [
  { kind: "work", title: "New work", caption: "When a teacher sets something new." },
  { kind: "marks", title: "Marks back", caption: "When a mark or a result comes back." },
  { kind: "changes", title: "Changes before school", caption: "An hour before your first class: relief teachers and room changes." },
  { kind: "notices", title: "Daily notices", caption: "The day's notices, once they're up." },
];

/** Why the switch can't go on, where this build or this phone can't take push at all (lib/push.ts). */
const CANT: Record<Exclude<PushSupport, "ok" | "web">, string> = {
  simulator: "Notifications only reach a real phone.",
  "expo-go-android": "Expo Go on Android can't receive notifications. The Compass Neo app can.",
  "no-project": "This build of the app isn't set up for notifications yet.",
};

/** The glyph column of a settings heading (head.tsx) and its gap: the kinds line up under the card's title. */
const UNDER_TITLE = 18 + space[3];

/**
 * Notifications on this phone (lib/push.ts, convex/push.ts): a switch for all of them, and one for each kind once
 * they're on. On means the OS allows them and the server has this phone; turning it on asks the OS if it still can,
 * and turning it off drops this phone on the server. When the OS has stopped asking (the student said no), only the
 * phone's own settings can turn them back on, so the card says so and offers the way there, a glass button. The kinds
 * fold open under the switch the way everything in the app opens; each one changes at once and tells the server after.
 */
export function NotificationsCard({ token }: { token: string }) {
  const c = useTheme();
  const prefs = useQuery(api.push.prefs, { token });
  const [permission, setPermission] = usePushPermission();
  const register = useMutation(api.push.register);
  const unregister = useMutation(api.push.unregister);
  const setPrefs = useMutation(api.push.setPrefs).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.push.prefs, { token: args.token });
    if (!now) return;
    const next = { ...now };
    for (const { kind } of KINDS) next[kind] = args.prefs[kind] ?? now[kind];
    store.setQuery(api.push.prefs, { token: args.token }, next);
  });
  // The switch's new place while turning on or off is under way (asking the OS, registering).
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = pushSupport === "ok";
  if (pushSupport === "web" || prefs === undefined || (supported && permission === undefined)) return null;
  const blocked = supported && permission === "blocked";
  const on = pending ?? (supported && permission === "granted" && prefs !== null);

  const flip = (next: boolean) => {
    if (pending != null) return;
    setError(null);
    setPending(next);
    const done = next
      ? turnOn(token, register).then(r => {
          if (r === "on") setPermission("granted");
          else if (r === "blocked") setPermission("blocked");
          else if (r === "failed") setError("That didn't work. Check your connection and try again.");
        })
      : turnOff(token, unregister);
    void done.catch(() => setError("That didn't work. Try again.")).finally(() => setPending(null));
  };
  const choose = (kind: Kind, value: boolean) => {
    // Still registering: the kinds start all on, and can change once the server has this phone.
    if (!prefs) return;
    setError(null);
    void setPrefs({ token, prefs: { [kind]: value } }).catch(() => setError("That didn't save. Try again."));
  };

  const caption =
    pushSupport !== "ok"
    ? CANT[pushSupport]
    : blocked
      ? "They're turned off for Compass Neo in your phone's settings."
      : on
        ? "Pick what this phone tells you about."
        : "New work, marks back, changes before school and the day's notices.";

  return (
    <Card panelStyle={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <SettingHead ios="bell.fill" android="notifications" title="Notifications" caption={caption}>
            {error && (
              <Text variant="caption" tone="warn" accessibilityLiveRegion="polite" style={{ marginTop: 2 }}>
                {error}
              </Text>
            )}
          </SettingHead>
        </View>
        <Toggle value={on} onChange={flip} disabled={!supported || blocked} label="Notifications" hint={caption} />
      </View>

      <Fold open={blocked}>
        <View style={{ paddingLeft: UNDER_TITLE }}>
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon ios="gearshape.fill" android="settings" size={13} color={c.text1} weight="semibold" />}
            onPress={() => void Linking.openSettings().catch(() => {})}
            style={{ alignSelf: "flex-start" }}
          >
            Open Settings
          </Button>
        </View>
      </Fold>

      <Fold open={on && !blocked}>
        <View style={{ gap: space[3] }}>
          {KINDS.map(k => (
            <Fragment key={k.kind}>
              <Rule inset={UNDER_TITLE} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: UNDER_TITLE }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontSize: 14 }}>
                    {k.title}
                  </Text>
                  <Text variant="caption" tone="2">
                    {k.caption}
                  </Text>
                </View>
                <Toggle value={prefs?.[k.kind] ?? true} onChange={v => choose(k.kind, v)} label={k.title} hint={k.caption} />
              </View>
            </Fragment>
          ))}
        </View>
      </Fold>
    </Card>
  );
}

/**
 * The platform's own switch: on iOS 26 it is Liquid Glass already, so it is left as iOS draws it but in Neo blue. A
 * controlled switch: a press it ignores springs back. Android's gets a selection tick (iOS's switch has its own).
 */
function Toggle({ value, onChange, disabled, label, hint }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; hint?: string }) {
  const c = useTheme();
  const android = Platform.OS === "android";
  return (
    <Switch
      value={value}
      onValueChange={v => {
        if (android) void Haptics.selectionAsync().catch(() => {});
        onChange(v);
      }}
      disabled={disabled}
      trackColor={{ true: c.neo, false: android ? c.text3 : undefined }}
      thumbColor={android ? "#fff" : undefined}
      accessibilityLabel={label}
      accessibilityHint={hint}
    />
  );
}
