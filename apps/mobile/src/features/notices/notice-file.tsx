import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Rule } from "@/components/ui/card";
import { Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/theme";
import { HUES, space } from "@/theme/tokens";
import { fileKind, hostOf, linkKind } from "@/features/class/files";
import { Glyph } from "@/features/class/glyph";
import type { Notice } from "./data";
import { useOpen } from "./text";

/**
 * A file or a link a notice carries, as a row under a hairline, the way a class's files are drawn: what it is (its
 * kind's glyph in the kind's colour), its name, and a quiet line (the kind, a link's site, or that it is only on
 * Compass). The whole row opens it in the in-app browser, a file through Compass Neo's own link, which needs no sign-in
 * there. One the notice named without saying where it is stays, dimmed, with nothing to press.
 */
export function NoticeFile({ file: f }: { file: Notice["attachments"][number] }) {
  const c = useTheme();
  const open = useOpen();
  const kind = f.external ? linkKind(f.href) : fileKind(f.name);
  const hue = kind.hue != null ? HUES[kind.hue] : null;
  const meta = f.href ? (f.external ? (hostOf(f.href) ?? kind.label) : kind.label) : "Only on Compass";
  const body = (pressed: boolean) => (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], minHeight: 48 }, pressed && { backgroundColor: c.lineFaint }, !f.href && { opacity: 0.5 }]}>
      <View style={{ width: 22, alignItems: "center" }}>
        <Glyph name={kind.glyph} size={18} color={hue ? (c.dark ? hue.dark : hue.light) : c.text2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={2}>
          {f.name}
        </Text>
        <Text variant="caption" tone="3" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {f.href && f.external && <Icon ios="arrow.up.forward" android="arrow_outward" size={12} color={c.text3} weight="semibold" />}
    </View>
  );
  return (
    <View>
      <Rule />
      {f.href ? (
        <Pressable
          accessibilityRole={f.external ? "link" : "button"}
          accessibilityLabel={`${f.name}, ${meta}`}
          accessibilityHint={f.external ? "Opens the link" : "Opens the file"}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            open(f.href!);
          }}
        >
          {({ pressed }) => body(pressed)}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${f.name}, only on Compass, cannot be opened here`}>
          {body(false)}
        </View>
      )}
    </View>
  );
}
