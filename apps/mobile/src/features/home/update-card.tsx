import { useState } from "react";
import { Linking } from "react-native";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { restartIntoUpdate, useAppUpdate } from "@/lib/updates";

/**
 * Home's word that the app can be newer (lib/updates.ts), at the top of the page, only while there is something to
 * do: a new APK opens its download (Android then offers to install it over this one); an update already downloaded
 * restarts into it (a restart that fails puts the card away until the app is next opened).
 */
export function UpdateCard() {
  const update = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  if (!update || dismissed) return null;

  if (update.kind === "apk")
    return (
      <Notice
        title={`Compass Neo ${update.version} is out`}
        action={
          <Button size="sm" onPress={() => void Linking.openURL(update.url)} accessibilityHint="Downloads the new version, then Android offers to install it">
            Download update
          </Button>
        }
      >
        {update.notes ?? "A new version of the app. Download it and install it over this one: you stay signed in."}
      </Notice>
    );

  return (
    <Notice
      title="An update is ready"
      action={
        <Button
          size="sm"
          variant="secondary"
          pending={restarting}
          pendingLabel="Restarting"
          onPress={() => {
            setRestarting(true);
            void restartIntoUpdate().catch(() => {
              setRestarting(false);
              setDismissed(true);
            });
          }}
        >
          Restart now
        </Button>
      }
    >
      {"It's downloaded and starts the next time you open the app, or now if you restart."}
    </Notice>
  );
}
