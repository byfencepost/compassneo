import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { seeThroughBar } from "@/components/ui/screen";
import { Backend } from "@/lib/backend";
import { hydrate } from "@/lib/store";
import { usePush } from "@/lib/push";
import { useEndGuest, useGuest } from "@/lib/guest";
import { useSession } from "@/lib/session";
import { useAutoSync } from "@/lib/sync";
import { ThemeRoot, useTheme } from "@/theme/theme";

void SplashScreen.preventAutoHideAsync();

/**
 * The app: Convex, the theme, and two worlds behind a guard. Signed out, only the sign-in screen exists; signed in,
 * home (one page, as on the web) and the pages pushed over it. The splash stays up until what the phone keeps (the session, the last
 * days seen) has been read, so the first frame is already the right screen with yesterday's data on it.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void hydrate().finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Backend>
          <ThemeRoot>
            <Routes />
          </ThemeRoot>
        </Backend>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Routes() {
  const c = useTheme();
  const session = useSession();
  const signedIn = session.status !== "signed-out";
  // A friend signed in on this phone in guest mode (lib/guest.ts): home is their day, and the student's pages are shut.
  const guest = useGuest();
  const guestOn = signedIn && !!guest;
  useAutoSync(session.token);
  // The guest's account is kept synced too, while they look (their relief teachers change by the minute).
  useAutoSync(guestOn ? guest.token : null, { guest: true });
  // Signed in: registers this phone for notifications (asking once, a moment after home shows) and opens the page a
  // tapped notification is about (lib/push.ts). Not while a guest has the phone: a tap would open the student's page.
  usePush(guestOn ? null : session.token);
  // The phone's own sign-in gone behind its back (a farewell) takes any guest with it, so none waits for the next one.
  const endGuest = useEndGuest();
  const stray = !signedIn && !!guest;
  useEffect(() => {
    if (stray) endGuest();
  }, [stray, endGuest]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.page);
    void SplashScreen.hideAsync();
  }, [c.page]);

  // The bar over home and every page pushed on it. With Liquid Glass (iOS 26) it is see-through: the page scrolls up
  // under it and blurs away progressively beneath its edge (the soft scroll edge effect, iOS's own; never with a blur
  // effect on top), the bar's glass buttons floating over it. Elsewhere (Android, iOS before 26) it is solid on the page
  // colour, no hairline, and the page starts under it. Screen (components/ui/screen.tsx) insets its scroll to match.
  const bar = seeThroughBar
    ? ({ headerShown: true, headerTransparent: true, headerStyle: { backgroundColor: "transparent" }, scrollEdgeEffects: { top: "soft" } } as const)
    : ({ headerShown: true, headerTransparent: false, headerStyle: { backgroundColor: c.page } } as const);

  // A pushed page: a small title in the bar, the back button with no label.
  const page = (title: string) =>
    ({
      ...bar,
      title,
      headerBackButtonDisplayMode: "minimal",
      headerTitleStyle: { color: c.text1 },
      headerShadowVisible: false,
    }) as const;

  // The navigation theme decides the native header's own light or dark (its glass back button, its title).
  const nav = c.dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...nav, colors: { ...nav.colors, primary: c.neo, background: c.page, card: c.page, text: c.text1, border: c.line } };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={c.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.page },
          headerStyle: { backgroundColor: c.page },
          headerTintColor: c.text1,
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ animation: "fade" }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          {/* Home: one page, no tab bar, under the same bar with no title: home sets its items (the mark, the sync
              gauge, the photo; features/home/top-bar.tsx). Everything else is pushed over it, under the bar with its
              title (its back button is Liquid Glass on iOS 26). With a guest on, home is their day under their
              banner (features/guest), and every other page is shut: signing a guest in closes the pages over home. */}
          <Stack.Screen name="index" options={{ ...bar, headerTitle: "", animation: "fade" }} />
          <Stack.Protected guard={!guestOn}>
            <Stack.Screen name="grades" options={page("Grades")} />
            <Stack.Screen name="todo" options={page("To do")} />
            <Stack.Screen name="notices" options={page("Notices")} />
            <Stack.Screen name="attendance" options={page("Attendance")} />
            <Stack.Screen name="events" options={page("Events")} />
            <Stack.Screen name="chronicle" options={page("Chronicle")} />
            <Stack.Screen name="settings" options={page("Settings")} />
            <Stack.Screen name="guest" options={page("Guest mode")} />
            {/* On iOS the header is see-through (before iOS 26 too), so the back button floats as Liquid Glass over the
                class's top glow, and on iOS 26 the scroll blurs away softly under it as every page's does. */}
            <Stack.Screen
              name="class/[code]"
              options={{
                headerShown: true,
                headerTitle: "",
                headerBackButtonDisplayMode: "minimal",
                headerTransparent: Platform.OS === "ios",
                headerStyle: Platform.OS === "ios" ? { backgroundColor: "transparent" } : { backgroundColor: c.page },
                scrollEdgeEffects: { top: "soft" },
              }}
            />
          </Stack.Protected>
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
