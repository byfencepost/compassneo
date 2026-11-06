import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { keepSession, signOutNotice, type Me } from "@/lib/session";
import { lastSchool, rememberSchool, type School } from "@/lib/schools";
import { useSyncRun } from "@/lib/sync";
import { space } from "@/theme/tokens";
import { Text } from "@/components/ui/text";
import { Notice } from "@/components/ui/notice";
import { Wordmark } from "@/components/brand/logo";
import { CompassDial, SWEEP, type NeedleMood } from "./compass-dial";
import { usePacedSync } from "./paced-sync";
import { SchoolStep, type AddressHint } from "./school-step";
import { AddressStep } from "./address-step";
import { CredentialsStep } from "./credentials-step";
import { useStored } from "@/lib/store";

type Step =
  | { kind: "school" }
  | { kind: "address"; hint: AddressHint | null }
  | { kind: "credentials"; school: School }
  /** Signed in to an account not synced before: the compass shows the first sync, then the app opens. */
  | { kind: "syncing"; token: string; me: Me; at: number };

/** However the sync is going, the app opens this long after signing in; the sync carries on behind it. */
const SYNC_PATIENCE = 20_000;
/** A sync still waiting its turn on the server this long after signing in does not hold the screen either. */
const QUEUE_PATIENCE = 5_000;
/** Once the needle has found north it settles, and the line says so, for this long before the app takes over. */
const SETTLE_MS = 1100;
/** The mark at the centre of the dial. */
const MARK = 68;

const TAGLINE = "Sign in with your school's Compass account.";

/** Where to start: the last school this phone used, else the picker. */
function firstStep(): Step {
  const last = lastSchool();
  return last ? { kind: "credentials", school: last } : { kind: "school" };
}

/** Scrolls the step up under the top edge, so the field and what follows it sit above the keyboard. */
function reveal(scroll: RefObject<ScrollViewInstance | null>, stageY: RefObject<number>) {
  scroll.current?.scrollTo({ y: Math.max(0, stageY.current - space[4]), animated: true });
}

/**
 * The sign-in screen, the web's (apps/web/app/features/login/login-screen.tsx) on a phone. One question at a time:
 * which school, then who you are. The compass and the wordmark stay at the top; the steps cross-fade below them.
 *
 * Signing in to an account synced before (another device, a sign-in again) opens the app at once on what it already
 * has. A first sign-in stays here while the first sync runs: the needle swings from west of north across the dial as
 * its steps settle, the bearings filling behind it like a gauge, then finds north, "All synced", and the app takes
 * over. It says nothing about what is being fetched; the compass is the progress. A slow sync, or one still queued,
 * does not hold the person here past SYNC_PATIENCE or QUEUE_PATIENCE: it carries on behind the app.
 *
 * The keyboard: the page scrolls inside a KeyboardAvoidingView, and when a field is typed in with the keyboard up,
 * the step is scrolled up under the top edge, so the search results or the sign-in button are never behind it.
 */
export function LoginScreen() {
  const inset = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [step, setStep] = useState<Step>(firstStep);
  // Bumps with each step: the stage cross-fades on it, and a step the person moved to takes the keyboard.
  const [stepKey, setStepKey] = useState(0);
  // Why this phone was signed out, if it was ("Your Compass password has changed").
  const notice = useStored(signOutNotice);

  const scroll = useRef<ScrollViewInstance>(null);
  const stageY = useRef(0);
  const typing = useRef(false);

  const go = (next: Step) => {
    setStep(next);
    setStepKey(k => k + 1);
  };
  const choose = (school: School) => {
    rememberSchool({ slug: school.slug, name: school.name });
    go({ kind: "credentials", school });
  };
  const changeSchool = () => go({ kind: "school" });

  const signedIn = (token: string, me: Me, cached: boolean) => {
    Keyboard.dismiss();
    if (cached) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      keepSession(token, me);
      return;
    }
    scroll.current?.scrollTo({ y: 0, animated: true });
    go({ kind: "syncing", token, me, at: Date.now() });
  };

  // ---------- the first sync ----------

  const syncing = step.kind === "syncing" ? step : null;
  const run = useSyncRun(syncing?.token ?? null);
  const sync = usePacedSync(syncing ? run : null);
  // Found north: the sync is in, or patience ran out. Never undone, even if another run starts meanwhile.
  const [north, setNorth] = useState(false);
  if (syncing && !north && sync.complete) setNorth(true);

  // A run still waiting for the server's pool (or none at all) gets the shorter patience.
  const waiting = syncing != null && (run === null || (!!run && !run.aliveAt && !run.finishedAt));
  useEffect(() => {
    if (!syncing || north) return;
    const wait = Math.max(0, syncing.at + (waiting ? QUEUE_PATIENCE : SYNC_PATIENCE) - Date.now());
    const t = setTimeout(() => setNorth(true), wait);
    return () => clearTimeout(t);
  }, [syncing, north, waiting]);

  // Then the app opens, once the needle has settled on north. The root layout's guard swaps to the tabs.
  useEffect(() => {
    if (!syncing || !north) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => keepSession(syncing.token, syncing.me), SETTLE_MS);
    return () => clearTimeout(t);
  }, [syncing, north]);

  const tagline = !syncing ? TAGLINE : north ? "All synced" : "Syncing";
  useEffect(() => {
    if (syncing) AccessibilityInfo.announceForAccessibility(tagline);
  }, [syncing, tagline]);

  const heading = syncing ? (north ? 0 : -SWEEP / 2 + SWEEP * sync.progress) : 0;
  const gauge = syncing ? (north ? SWEEP : SWEEP * sync.progress) : 0;
  const mood: NeedleMood = !syncing ? "rest" : north ? "still" : "wait";

  // ---------- the keyboard ----------

  const onFieldFocus = () => {
    typing.current = true;
    if (Keyboard.isVisible()) reveal(scroll, stageY);
  };
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => typing.current && reveal(scroll, stageY));
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      typing.current = false;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Android's back gesture from the address step goes back to the school search, not out of the app.
  const onAddress = step.kind === "address";
  useEffect(() => {
    if (!onAddress) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep({ kind: "school" });
      setStepKey(k => k + 1);
      return true;
    });
    return () => sub.remove();
  }, [onAddress]);

  // The bezel spills past the mark: as wide as the column allows, never taller than the top of a short screen.
  const bezel = Math.round(Math.max(240, Math.min(width - space[5] * 2, height * 0.42, 360)));
  const autoFocus = stepKey > 0;
  const showNotice = !!notice && !syncing;

  return (
    <View style={{ flex: 1, paddingTop: inset.top }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingBottom: inset.bottom + space[5] }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!syncing}
        >
          <View style={{ flexGrow: 1, width: "100%", maxWidth: 400, alignSelf: "center", paddingTop: space[3] }}>
            <View style={{ alignItems: "center" }}>
              <CompassDial size={bezel} mark={MARK} heading={heading} gauge={gauge} mood={mood} />
              <View accessible accessibilityRole="header" accessibilityLabel="Compass Neo" style={{ marginTop: space[6] }}>
                <Wordmark height={24} />
              </View>
              <View style={{ alignSelf: "stretch", marginTop: space[3], minHeight: 20 }}>
                <Animated.View key={tagline} entering={FadeIn.duration(320)} exiting={FadeOut.duration(160)}>
                  <Text variant="bodySm" tone="2" style={{ textAlign: "center" }}>
                    {tagline}
                  </Text>
                </Animated.View>
              </View>
            </View>

            {showNotice && (
              <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ marginTop: space[8] }}>
                <Notice status="warn" title={notice} />
              </Animated.View>
            )}

            <Animated.View
              layout={LinearTransition.duration(260)}
              onLayout={e => {
                stageY.current = e.nativeEvent.layout.y;
              }}
              style={{ marginTop: showNotice ? space[5] : space[8] }}
            >
              <Animated.View key={stepKey} entering={FadeIn.duration(280).delay(60)} exiting={FadeOut.duration(140)}>
                {step.kind === "school" && (
                  <SchoolStep
                    autoFocus={autoFocus}
                    onChoose={choose}
                    onNeedAddress={hint => go({ kind: "address", hint })}
                    onFieldFocus={onFieldFocus}
                  />
                )}
                {step.kind === "address" && (
                  <AddressStep autoFocus={autoFocus} hint={step.hint} onChoose={choose} onBack={changeSchool} onFieldFocus={onFieldFocus} />
                )}
                {step.kind === "credentials" && (
                  <CredentialsStep
                    autoFocus={autoFocus}
                    school={step.school}
                    onChangeSchool={changeSchool}
                    onSignedIn={signedIn}
                    onFieldFocus={onFieldFocus}
                  />
                )}
              </Animated.View>
            </Animated.View>

            <View style={{ flexGrow: 1, minHeight: space[8] }} />
            <Text variant="caption" tone="2" style={{ textAlign: "center", paddingHorizontal: space[2] }}>
              Compass Neo keeps your login encrypted and uses it only to keep you signed in.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
