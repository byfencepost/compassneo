import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "@/theme/theme";
import { alpha, radius, space } from "@/theme/tokens";
import { Glass } from "./glass";
import { Text } from "./text";

/** Glaze's alert as glass: tinted by its status (none for info), a title, a line under it and an optional action. */
export function Notice({
  status = "info",
  title,
  children,
  action,
}: {
  status?: "info" | "ok" | "warn" | "fail";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const c = useTheme();
  const mark = { info: undefined, ok: c.ok, warn: c.warn, fail: c.fail }[status];
  const tone = ({ info: "1", ok: "ok", warn: "warn", fail: "fail" } as const)[status];
  return (
    <View accessibilityRole="alert">
      <Glass tint={mark ? alpha(mark, c.dark ? 0.22 : 0.16) : undefined} round={radius.overlay + 6} style={{ padding: space[4], gap: space[1] }}>
        <Text variant="label" tone={tone} style={{ fontWeight: "600" }}>
          {title}
        </Text>
        {children != null && (
          <Text variant="bodySm" tone="2">
            {children}
          </Text>
        )}
        {action != null && <View style={{ marginTop: space[2], alignSelf: "flex-start" }}>{action}</View>}
      </Glass>
    </View>
  );
}

/** A quiet empty state: a line and a hint, centred. */
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space[10], paddingHorizontal: space[6], gap: space[2] }}>
      {icon}
      <Text variant="subheading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {children != null && (
        <Text variant="bodySm" tone="2" style={{ textAlign: "center" }}>
          {children}
        </Text>
      )}
    </View>
  );
}

/** A centred spinner for a screen still loading. */
export function Loading({ label }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: space[10], gap: space[3] }}>
      <ActivityIndicator color={c.text2} />
      {label && (
        <Text variant="caption" tone="2">
          {label}
        </Text>
      )}
    </View>
  );
}

/** A faint block standing in for content still loading: ink at a whisper, so the glow behind still shows. */
export function Skeleton({ height = 16, width = "100%", round = 6 }: { height?: number; width?: number | `${number}%`; round?: number }) {
  const c = useTheme();
  return <View style={{ height, width, borderRadius: round, backgroundColor: c.dark ? "rgba(244,244,243,0.08)" : "rgba(5,5,5,0.06)" }} />;
}
