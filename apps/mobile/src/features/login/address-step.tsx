import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAction } from "convex/react";
import * as Haptics from "expo-haptics";
import { api } from "@compassneo/backend/api";
import { normalizeSlug, type School } from "@/lib/schools";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { GlassIconButton } from "@/components/ui/glass";
import { checkAddress, NOT_AN_ADDRESS } from "./answers";
import { LoginField } from "./field";
import type { AddressHint } from "./school-step";

/**
 * The way through when Compass Neo cannot find a school's address on its own: the person types the part before
 * .compass.education. Pasting the whole address works too. A real address is remembered for everyone after them.
 */
export function AddressStep({
  autoFocus,
  hint,
  onChoose,
  onBack,
  onFieldFocus,
}: {
  autoFocus: boolean;
  hint: AddressHint | null;
  onChoose: (s: School) => void;
  onBack: () => void;
  onFieldFocus: () => void;
}) {
  const c = useTheme();
  const verify = useAction(api.schools.verify);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gone back before the check answered: its answer is for a step the person has left.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const fail = (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setError(message);
  };

  const submit = async () => {
    if (pending) return;
    const slug = normalizeSlug(value);
    if (!slug) return fail(NOT_AN_ADDRESS);
    setError(null);
    setPending(true);
    const r = await checkAddress(verify, slug);
    if (!live.current) return;
    setPending(false);
    if ("school" in r) onChoose(r.school);
    else fail(r.error);
  };

  return (
    <View style={{ gap: space[5] }}>
      <LoginField
        label="Compass address"
        mono
        value={value}
        onChangeText={v => {
          setValue(v);
          setError(null);
        }}
        placeholder="yourschool-vic"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        submitBehavior="submit"
        onSubmitEditing={() => void submit()}
        onFocus={onFieldFocus}
        error={error}
        hint={`${hint ? `Compass Neo could not find ${hint.name} on its own. ` : ""}Open Compass in your browser and copy the start of the address.`}
        trailing={
          <Text variant="mono" color={c.text2} style={{ fontSize: 15, paddingRight: space[3] }} numberOfLines={1}>
            .compass.education
          </Text>
        }
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        {/* Round glass, as tall as the button beside it. */}
        <GlassIconButton ios="chevron.left" android="arrow_back" label="Back to the school search" size={54} onPress={onBack} />
        <Button size="lg" onPress={() => void submit()} pending={pending} pendingLabel="Checking" style={{ flex: 1 }}>
          Use this address
        </Button>
      </View>
    </View>
  );
}
