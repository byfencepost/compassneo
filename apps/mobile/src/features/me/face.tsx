import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/theme/theme";
import { classColor } from "@/theme/tokens";
import type { Me } from "@/lib/session";
import { Text } from "@/components/ui/text";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => [...w][0]!.toUpperCase())
    .join("");

/**
 * The person, as the web draws them: their Compass photo once a sync has copied it, else their initials on Neo blue.
 * The initials sit under the photo, so they show while it loads and stay if it never does. Only a picture: the name is
 * written beside it.
 */
export function Face({ me, size = 56 }: { me: Me; size?: number }) {
  const c = useTheme();
  const neo = classColor(null, c);
  const [failed, setFailed] = useState(false);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: neo.fill, alignItems: "center", justifyContent: "center" }}
    >
      <Text variant={size >= 48 ? "heading" : size >= 40 ? "label" : "caption"} color={neo.on} style={{ fontWeight: "600" }}>
        {initials(me.fullName ?? me.displayName)}
      </Text>
      {me.photoUrl && !failed && (
        <Image
          source={{ uri: me.photoUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
