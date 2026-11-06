import { useState } from "react";
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, View } from "react-native";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { api } from "@compassneo/backend/api";
import { startGuest } from "@/lib/guest";
import type { School } from "@/lib/schools";
import { useSession, type Me } from "@/lib/session";
import { space } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Notice } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { AddressStep } from "@/features/login/address-step";
import { CredentialsStep } from "@/features/login/credentials-step";
import { SchoolStep, type AddressHint } from "@/features/login/school-step";

type Step = { kind: "credentials"; school: School } | { kind: "school" } | { kind: "address"; hint: AddressHint | null };

/** Two sign-ins are the same account when they are the same school and username (convex/accounts.ts accountKey). */
const sameAccount = (a: Me, b: Me) => a.slug === b.slug && a.username.trim().toLowerCase() === b.username.trim().toLowerCase();

const SAME = "That's the account already signed in here.";
const noop = () => {};

/**
 * Guest mode's sign-in, pushed from Settings (features/me/guest-card.tsx): a friend signs in with their own Compass
 * login to check their timetable, and the phone's own student stays signed in underneath. It opens on the phone's own
 * school, as a friend is most likely at the same one, with Change school for when they are not; the steps are the
 * sign-in screen's own (features/login), the credentials asking for no autofill (they are the friend's, not the
 * phone's). A school chosen here is not remembered on the phone either.
 *
 * Once in, the root layout's guard closes this page and Settings, and home becomes the guest's day
 * (features/guest/guest-home.tsx). No compass sweeping through the first sync: the day's own skeleton waits for it.
 * The phone's own login typed in by mistake is signed straight back out (only that new sign-in, so the phone's stays)
 * and said so.
 */
export function GuestSignIn() {
  const { me: owner } = useSession();
  const signOut = useMutation(api.auth.signOut);
  const [step, setStep] = useState<Step>(() => ({ kind: "credentials", school: { slug: owner?.slug ?? "", name: owner?.schoolName ?? "" } }));
  const [stepKey, setStepKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  if (!owner) return <Screen>{null}</Screen>;

  const go = (next: Step) => {
    setStep(next);
    setStepKey(k => k + 1);
  };
  const choose = (school: School) => go({ kind: "credentials", school });
  const changeSchool = () => go({ kind: "school" });

  const signedIn = (token: string, me: Me) => {
    Keyboard.dismiss();
    if (sameAccount(me, owner)) {
      void signOut({ token }).catch(() => {});
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      AccessibilityInfo.announceForAccessibility(SAME);
      setNotice(SAME);
      // A fresh form: the one signed in with stays pending (the sign-in hands over from there), and the login is the phone's own.
      go({ kind: "credentials", school: step.kind === "credentials" ? step.school : { slug: me.slug, name: me.schoolName } });
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    startGuest(token, me);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Screen contentStyle={{ gap: space[5] }}>
        <Text variant="bodySm" tone="2">
          Sign in with your own Compass login to see your timetable. {owner.displayName} stays signed in, and one press signs you out.
        </Text>

        {notice && (
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)}>
            <Notice status="warn" title={notice}>
              {"Guest mode is for someone else's Compass login."}
            </Notice>
          </Animated.View>
        )}

        <Animated.View layout={LinearTransition.duration(260)}>
          <Animated.View key={stepKey} entering={FadeIn.duration(280).delay(60)} exiting={FadeOut.duration(140)}>
            {step.kind === "credentials" && (
              <CredentialsStep
                guest
                autoFocus={stepKey > 0}
                school={step.school}
                onChangeSchool={changeSchool}
                onSignedIn={signedIn}
                onFieldFocus={noop}
              />
            )}
            {step.kind === "school" && (
              <SchoolStep autoFocus onChoose={choose} onNeedAddress={hint => go({ kind: "address", hint })} onFieldFocus={noop} />
            )}
            {step.kind === "address" && <AddressStep autoFocus hint={step.hint} onChoose={choose} onBack={changeSchool} onFieldFocus={noop} />}
          </Animated.View>
        </Animated.View>

        <View style={{ minHeight: space[4] }} />
        <Text variant="caption" tone="2" style={{ textAlign: "center", paddingHorizontal: space[2] }}>
          Guest mode shows only your timetable, and signs you out by itself after eight hours.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
