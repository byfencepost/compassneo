import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@compassneo/backend/api";

/**
 * Whether there is something newer to run than what is running, the two ways the app updates (convex/releases.ts):
 *   ota  EAS Update: new JS for this same build, already downloaded (expo-updates checks on every launch). It runs
 *        from the next launch on its own; restarting now just brings it in sooner.
 *   apk  Android only, sideloaded: a newer native build than this one is out. Native changes can't come over the
 *        air, so it has to be downloaded and installed over this one (same signing key, so nothing is lost).
 * A new APK wins: it carries the new JS too. Expo Go and the web have neither.
 */
export type AppUpdate =
  | { kind: "apk"; version: string; url: string; notes: string | null }
  | { kind: "ota" }
  | null;

const ownBuild = Number(Application.nativeBuildVersion ?? NaN);
/** A build that installs APKs: Android, not Expo Go, and one that knows its own build number. */
const sideloaded = Platform.OS === "android" && !isRunningInExpoGo() && Number.isFinite(ownBuild);

export function useAppUpdate(): AppUpdate {
  const latest = useQuery(api.releases.latest, sideloaded ? { platform: "android" } : "skip");
  const { isUpdatePending } = Updates.useUpdates();

  if (sideloaded && latest && latest.build > ownBuild) return { kind: "apk", version: latest.version, url: latest.url, notes: latest.notes };
  if (Updates.isEnabled && isUpdatePending) return { kind: "ota" };
  return null;
}

/** Runs the downloaded update now instead of at the next launch. */
export const restartIntoUpdate = () => Updates.reloadAsync();
