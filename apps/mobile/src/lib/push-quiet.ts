import { LogBox } from "react-native";
import { isRunningInExpoGo } from "expo";

/**
 * In Expo Go, expo-notifications warns as it loads (and again at the first token) that push is limited there, the
 * second time in words about Android even on an iPhone. lib/push.ts says what does and doesn't work itself, once, so
 * the toasts go (Metro's log still prints them). Imported by lib/push.ts before expo-notifications, so this runs first.
 */
if (isRunningInExpoGo())
  LogBox.ignoreLogs(["`expo-notifications` functionality is not fully supported in Expo Go", "expo-notifications: Android Push notifications"]);
