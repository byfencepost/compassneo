import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Text } from "./text";

/**
 * A list row inside a card's panel: a leading slot (a colour stripe, an icon), a title and caption, and a trailing
 * slot (a chip, a mark, a chevron). Pressable when given onPress. Rows sit edge to edge in a `Card padded={false}`,
 * with a `Rule` between them.
 */
export function Row({
  title,
  caption,
  leading,
  trailing,
  onPress,
  chevron,
  titleLines = 2,
  accessibilityLabel,
  accessibilityHint,
}: {
  title: ReactNode;
  caption?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  titleLines?: number;
  /** What a screen reader says for the whole row, when title and caption read badly together. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const c = useTheme();
  const body = (
    <>
      {leading != null && <View style={{ flexShrink: 0 }}>{leading}</View>}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === "string" ? (
          <Text variant="label" numberOfLines={titleLines}>
            {title}
          </Text>
        ) : (
          title
        )}
        {caption != null &&
          (typeof caption === "string" ? (
            <Text variant="caption" tone="2" numberOfLines={2}>
              {caption}
            </Text>
          ) : (
            caption
          ))}
      </View>
      {trailing != null && <View style={{ flexShrink: 0 }}>{trailing}</View>}
      {chevron && (
        <Text variant="heading" tone="3" style={{ marginLeft: -space[1] }}>
          ›
        </Text>
      )}
    </>
  );
  const style = { flexDirection: "row" as const, alignItems: "center" as const, gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: 52 };
  if (!onPress)
    return (
      <View style={style} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [style, pressed && { backgroundColor: c.lineFaint }]}
    >
      {body}
    </Pressable>
  );
}
