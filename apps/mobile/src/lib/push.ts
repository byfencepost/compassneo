import "./push-quiet";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { router, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@compassneo/backend/api";
import { persisted } from "./store";

/**
 * Push notifications (convex/push.ts sends them through Expo's push service): new work, marks back, the morning's
 * changes, the day's notices. The phone's part:
 *
 * - Asking. Once, a moment after home first shows for a signed-in student (never on the sign-in screen), and never
 *   again on its own: a "no" is remembered, and after that the switch in Settings (features/me/notifications-card.tsx)
 *   is the way back, or the phone's own settings once the OS stops asking.
 * - Registering. Every launch while signed in, when the OS allows notifications: the Expo push token can change, and
 *   the server keeps one device per sign-in. Turned off in Settings, it stays off for that sign-in (the server drops
 *   the device with its session on sign-out, so the next sign-in starts fresh).
 * - Showing. A notification that comes in while the app is open still shows its banner.
 * - Opening. Tapping one (also when it launches the app) goes to the page it is about: its `data.url`, an app route
 *   checked against the routes the app has ("/class/10CP1?tab=work", "/notices", "/").
 *
 * Where push can't work it steps aside quietly, saying why once in the log: no EAS project id yet (`bunx eas-cli init`
 * in apps/mobile), a simulator, Expo Go on Android (remote push left Expo Go there in SDK 53), or the web.
 */

export type PushSupport = "ok" | "web" | "simulator" | "expo-go-android" | "no-project";

/** The EAS project the Expo push token belongs to (app.json's extra.eas.projectId, written by `eas init`). */
const projectIdOf = (): string | undefined => {
  const id: unknown = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id ? id : undefined;
};
const projectId = projectIdOf();

/** Whether this build, on this phone, can take push notifications at all. Can't change while the app runs. */
export const pushSupport: PushSupport =
  Platform.OS === "web"
    ? "web"
    : !Device.isDevice
      ? "simulator"
      : Platform.OS === "android" && isRunningInExpoGo()
        ? "expo-go-android"
        : !projectId
          ? "no-project"
          : "ok";

const WHY: Record<Exclude<PushSupport, "ok">, string> = {
  web: "the web app takes no push notifications.",
  simulator: "push notifications need a real phone; skipping on this simulator.",
  "expo-go-android": "Expo Go on Android can't take remote notifications (since SDK 53). Use a development build.",
  "no-project": "no EAS project id, so no Expo push token. Run `bunx eas-cli init` in apps/mobile, then reload.",
};

let explained = false;
function explain() {
  if (explained || pushSupport === "ok") return;
  explained = true;
  console.info(`push: ${WHY[pushSupport]}`);
}

// A notification arriving while the app is open shows as it would outside it: a banner, in the list, with its sound
// (on Android, no sound means no banner either). No badge: nothing here keeps a count to put on the icon.
if (Platform.OS !== "web")
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });

/**
 * What this phone remembers: whether it has asked the OS once already (it never asks on its own again), and the
 * sign-in that turned notifications off in Settings, as a fingerprint of its token (not the token itself).
 */
const kept = persisted<{ asked: boolean; off: string | null }>("cneo.push.v1", { asked: false, off: null });

/** FNV-1a: enough to tell one sign-in from the next without keeping its token in plain storage. */
function fingerprint(token: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}
const turnedOff = (token: string) => kept.get().off === fingerprint(token);

/** Granted (iOS's quiet "provisional" counts), not yet decided (asking may show the prompt), or only Settings can change it. */
export type Permission = "granted" | "ask" | "blocked";

function permissionOf(p: Notifications.NotificationPermissionsStatus): Permission {
  // On iOS the root status flattens what iOS says; its own status is the one to read.
  if (Platform.OS === "ios" && p.ios) {
    const s = p.ios.status;
    const { AUTHORIZED, PROVISIONAL, EPHEMERAL, NOT_DETERMINED } = IosAuthorizationStatus;
    if (s === AUTHORIZED || s === PROVISIONAL || s === EPHEMERAL) return "granted";
    return s === NOT_DETERMINED ? "ask" : "blocked";
  }
  if (p.granted) return "granted";
  return p.canAskAgain ? "ask" : "blocked";
}

const readPermission = async () => permissionOf(await Notifications.getPermissionsAsync());
const askPermission = async () => permissionOf(await Notifications.requestPermissionsAsync());

/** Android 13+ shows the permission prompt only once a channel exists; every notification goes through this one. */
let channel: Promise<unknown> | null = null;
function ensureChannel() {
  if (Platform.OS !== "android") return Promise.resolve();
  channel ??= Notifications.setNotificationChannelAsync("default", {
    name: "School updates",
    description: "New work, marks back, changes before school and the day's notices.",
    importance: AndroidImportance.HIGH,
  }).catch(() => {
    channel = null;
  });
  return channel;
}

type Register = (args: { token: string; pushToken: string; platform: "ios" | "android" }) => Promise<unknown>;
type Unregister = (args: { token: string }) => Promise<unknown>;

/** Gets this phone's Expo push token and hands it to the server for this sign-in. Throws when offline. */
async function registerDevice(token: string, register: Register) {
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  // Turned off in Settings while the token was on its way: leave it off.
  if (turnedOff(token)) return;
  await register({ token, pushToken, platform: Platform.OS === "ios" ? "ios" : "android" });
}

export type TurnOn = "on" | "blocked" | "declined" | "unsupported" | "failed";

/** The Settings switch going on: asks the OS if it still can, then registers. */
export async function turnOn(token: string, register: Register): Promise<TurnOn> {
  if (pushSupport !== "ok") {
    explain();
    return "unsupported";
  }
  kept.set({ asked: true, off: null });
  await ensureChannel();
  let permission = await readPermission();
  if (permission === "ask") permission = await askPermission();
  if (permission === "blocked") return "blocked";
  if (permission !== "granted") return "declined";
  try {
    await registerDevice(token, register);
    return "on";
  } catch (e) {
    console.warn("push: could not register this phone", e);
    return "failed";
  }
}

/** The Settings switch going off: this sign-in stays off on this phone until it is turned on again. */
export async function turnOff(token: string, unregister: Unregister) {
  kept.set(k => ({ ...k, off: fingerprint(token) }));
  await unregister({ token });
}

/** The OS's answer for this app, read again whenever the app comes back to the front (Settings may have changed it). */
export function usePushPermission() {
  const [permission, setPermission] = useState<Permission | undefined>(undefined);
  useEffect(() => {
    if (pushSupport === "web") return;
    let live = true;
    const read = () =>
      void readPermission()
        .then(p => live && setPermission(p))
        .catch(() => {});
    read();
    const sub = AppState.addEventListener("change", s => {
      if (s === "active") read();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return [permission, setPermission] as const;
}

/** How long after the signed-in app first shows before the first ask: home on screen and settled, not mid-fade. */
const FIRST_LOOK = 2000;

/**
 * Keeps this phone registered while someone is signed in (token), and opens the page a tapped notification is about.
 * Call once, in the root layout, with the session's token (null when signed out).
 */
export function usePush(token: string | null) {
  usePushRegistration(token);
  useNotificationTaps(!!token);
}

function usePushRegistration(token: string | null) {
  const register = useMutation(api.push.register);
  useEffect(() => {
    if (!token) return;
    if (pushSupport !== "ok") {
      explain();
      return;
    }
    let done = false;
    let busy = false;
    let gone = false;
    const run = async () => {
      // Never a prompt over the app switcher or a phone call; when it comes back to the front, the listener runs this.
      if (done || busy || gone || AppState.currentState === "background" || AppState.currentState === "inactive") return;
      if (turnedOff(token)) return;
      busy = true;
      try {
        await ensureChannel();
        let permission = await readPermission();
        if (permission === "ask" && !kept.get().asked) {
          kept.set(k => ({ ...k, asked: true }));
          permission = await askPermission();
        }
        if (permission !== "granted" || gone) return;
        await registerDevice(token, register);
        done = true;
      } catch (e) {
        // Offline, most likely: the next time the app comes to the front tries again.
        console.info("push: not registered yet, trying again later", e);
      } finally {
        busy = false;
      }
    };
    const timer = setTimeout(() => void run(), FIRST_LOOK);
    // Back from Settings with notifications allowed, or back online: register then.
    const sub = AppState.addEventListener("change", s => {
      if (s === "active") void run();
    });
    return () => {
      gone = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [token, register]);
}

/** The pages a notification may open: home, the pages pushed over it, and a class (with its tab in the query). */
const PAGES = new Set(["/", "/grades", "/todo", "/notices", "/attendance", "/events", "/chronicle", "/settings"]);
const CLASS = /^\/class\/[\w\-~%.]+$/;

/** A notification's `url` as a route of this app, or null: only app-relative paths to pages that exist. */
export function routeOf(url: unknown): Href | null {
  if (typeof url !== "string" || url.length > 300) return null;
  // One leading slash (not "//host"), then URL-safe characters only: no scheme, no spaces, no backslashes.
  if (!/^\/(?!\/)[\w\-~%./?=&+]*$/.test(url) || url.includes("..")) return null;
  const path = url.split(/[?#]/)[0]!;
  if (!PAGES.has(path) && !CLASS.test(path)) return null;
  return url as Href;
}

/** The notification last opened from, so the same tap (seen at launch and by the listener) opens one page, not two. */
let opened: string | null = null;

function useNotificationTaps(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      // A tap on the notification itself (not a dismissal or some other action).
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = `${response.notification.request.identifier}:${response.notification.date}`;
      if (id === opened) return;
      opened = id;
      // Handled: a later mount (signing in again, a reload) doesn't open it a second time.
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Not there to clear on this platform.
      }
      const href = routeOf(response.notification.request.content.data?.url);
      if (!href) return;
      // Home is under everything: back down to it. Anything else opens over where the student is.
      if (href === "/") router.dismissTo("/");
      else router.push(href);
    };
    // The tap that launched the app (the stack is mounted by now: a parent's effect runs after its children's).
    try {
      open(Notifications.getLastNotificationResponse());
    } catch {
      // Not available on this platform.
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [signedIn]);
}
