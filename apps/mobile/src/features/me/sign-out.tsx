import { useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useSignOut } from "@/lib/session";

/**
 * Signing out, asked first with the phone's own alert, because the last device out takes the account with it
 * (convex/auth.ts signOut): the warning is the README's own line. Once confirmed the session goes at once and the root
 * guard shows sign-in. `pending` is true from the yes until this screen is gone.
 */
export function useAskSignOut() {
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);
  const ask = () =>
    Alert.alert("Sign out?", "Signing out of your last device deletes your account, your login and everything synced for it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          setPending(true);
          void signOut();
        },
      },
    ]);
  return { ask, pending };
}
