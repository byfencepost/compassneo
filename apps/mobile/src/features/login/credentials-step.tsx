import { useRef, useState, type ComponentRef } from "react";
import { AccessibilityInfo, Pressable, TextInput, View } from "react-native";
import { useAction } from "convex/react";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { api } from "@compassneo/backend/api";
import { hostOf, type School } from "@/lib/schools";
import type { Me } from "@/lib/session";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { GlassChip, Icon } from "@/components/ui/glass";
import { attemptSignIn, type SignInNotice } from "./answers";
import { LoginField } from "./field";

type Errors = { username?: string; password?: string };

/** The web's neo-shake: the form shakes its head once, short and small, so it reads as "no" and not as a toy. */
const SHAKE = [-6, 5, -3, 2, 0];

/**
 * Who you are: the chosen school as a card you can change, then username and password.
 *
 * `guest`: a friend signing in on this phone in guest mode (features/guest). The button says so, and the fields ask
 * for no autofill: the phone's keychain holds its own student's Compass login, which is not theirs to be offered, and
 * the guest's password is not the phone's to keep.
 */
export function CredentialsStep({
  autoFocus,
  school,
  onChangeSchool,
  onSignedIn,
  onFieldFocus,
  guest = false,
}: {
  autoFocus: boolean;
  school: School;
  onChangeSchool: () => void;
  onSignedIn: (token: string, me: Me, cached: boolean) => void;
  onFieldFocus: () => void;
  guest?: boolean;
}) {
  const c = useTheme();
  const signIn = useAction(api.auth.signIn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<SignInNotice | null>(null);
  const usernameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const shake = useSharedValue(0);
  const shaking = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  const say = (message: string, kind: Haptics.NotificationFeedbackType) => {
    void Haptics.notificationAsync(kind).catch(() => {});
    AccessibilityInfo.announceForAccessibility(message);
  };

  const submit = async () => {
    if (pending) return;
    const name = username.trim();
    const missing: Errors = {
      username: name ? undefined : "Enter the username you use for Compass.",
      password: password ? undefined : "Enter your Compass password.",
    };
    if (missing.username || missing.password) {
      setErrors(missing);
      setNotice(null);
      say(missing.username ?? missing.password ?? "", Haptics.NotificationFeedbackType.Warning);
      (missing.username ? usernameRef : passwordRef).current?.focus();
      return;
    }
    setErrors({});
    setNotice(null);
    setPending(true);
    const r = await attemptSignIn(signIn, school, name, password, guest);
    // Stays pending once signed in: the screen hands over to the sync, then the app, from here.
    if (r.ok) return onSignedIn(r.token, r.me, r.cached);
    setPending(false);
    const { problem } = r;
    if ("field" in problem) {
      setErrors({ password: problem.message });
      say(problem.message, Haptics.NotificationFeedbackType.Error);
      shake.set(withSequence(...SHAKE.map(x => withTiming(x, { duration: 80 }))));
      return;
    }
    setNotice(problem.notice);
    const kind = problem.notice.status === "warn" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error;
    say(`${problem.notice.title}. ${problem.notice.body}`, kind);
  };

  const openCompass = () => {
    void WebBrowser.openBrowserAsync(`https://${hostOf(school.slug)}`, {
      controlsColor: c.neoText,
      toolbarColor: c.page,
      dismissButtonStyle: "close",
    }).catch(() => {});
  };

  return (
    <View style={{ gap: space[5] }}>
      <Card
        foot={
          <>
            <Text variant="caption" tone="2" style={{ flex: 1 }}>
              Not your school?
            </Text>
            {/* Held still while signing in: the answer is for this school. */}
            <View style={{ opacity: pending ? 0.45 : 1, pointerEvents: pending ? "none" : "auto" }}>
              <GlassChip label="Change school" onPress={onChangeSchool} />
            </View>
          </>
        }
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3] }} accessible accessibilityLabel={`${school.name}, ${hostOf(school.slug)}`}>
          <View style={{ paddingTop: 1 }}>
            <Icon ios="graduationcap.fill" android="school" size={20} color={c.neoText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{school.name}</Text>
            <Text variant="mono" tone="2" numberOfLines={1}>
              {hostOf(school.slug)}
            </Text>
          </View>
        </View>
      </Card>

      <Animated.View style={[{ gap: space[4] }, shaking]}>
        <LoginField
          ref={usernameRef}
          label="Username"
          value={username}
          onChangeText={v => {
            setUsername(v);
            if (errors.username) setErrors(e => ({ ...e, username: undefined }));
          }}
          placeholder="jordan.lee"
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete={guest ? "off" : "username"}
          textContentType={guest ? "none" : "username"}
          importantForAutofill={guest ? "no" : "yes"}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          onFocus={onFieldFocus}
          error={errors.username}
        />
        <LoginField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={v => {
            setPassword(v);
            if (errors.password) setErrors(e => ({ ...e, password: undefined }));
          }}
          secureTextEntry={!revealed}
          mono={revealed}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete={guest ? "off" : "current-password"}
          textContentType={guest ? "none" : "password"}
          importantForAutofill={guest ? "no" : "yes"}
          returnKeyType="go"
          submitBehavior="submit"
          onSubmitEditing={() => void submit()}
          onFocus={onFieldFocus}
          error={errors.password}
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealed ? "Hide password" : "Show password"}
              accessibilityState={{ selected: revealed }}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                setRevealed(r => !r);
              }}
              style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
            >
              <Icon ios={revealed ? "eye.slash" : "eye"} android={revealed ? "visibility_off" : "visibility"} size={19} color={c.text2} />
            </Pressable>
          }
        />
      </Animated.View>

      {notice && (
        <Animated.View key={notice.title} entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
          <Notice
            status={notice.status}
            title={notice.title}
            action={
              notice.action === "open-compass" ? (
                <Button variant="secondary" onPress={openCompass} icon={<Icon ios="arrow.up.right" android="open_in_new" size={15} color={c.text1} />}>
                  Open Compass
                </Button>
              ) : notice.action === "change-school" ? (
                <Button variant="secondary" onPress={onChangeSchool}>
                  Change school
                </Button>
              ) : undefined
            }
          >
            {notice.body}
          </Notice>
        </Animated.View>
      )}

      <Animated.View layout={LinearTransition.duration(240)}>
        <Button size="lg" onPress={() => void submit()} pending={pending} pendingLabel="Signing in">
          {guest ? "Sign in as guest" : "Sign in"}
        </Button>
      </Animated.View>
    </View>
  );
}
