import type { ReactNode } from "react";
import { Text as RNText, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import type { Notice } from "./data";

/**
 * A notice's words as the school wrote them, with what in them can be pressed: web addresses become links, and an
 * original's own paragraphs, lists, bold and links are kept (the server has already turned its HTML into plain blocks,
 * convex/lib/plan.ts, so nothing of it is run here). Links open in the in-app browser, in the app's colours.
 */

type PlanBlock = NonNullable<Notice["blocks"]>[number];

const tick = () => void Haptics.selectionAsync().catch(() => {});

/**
 * Opens a page or a file in the in-app browser (Safari's sheet on iOS, a custom tab on Android). A Compass Neo file
 * link carries its own credential, so the browser needs no sign-in. If the browser will not come up, the system opens
 * it instead.
 */
export function useOpen() {
  const c = useTheme();
  return (url: string) => {
    WebBrowser.openBrowserAsync(url, { controlsColor: c.neoText, toolbarColor: c.page, dismissButtonStyle: "done", enableBarCollapsing: true }).catch(() =>
      Linking.openURL(url).catch(() => {}),
    );
  };
}

const URL_IN_TEXT = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Text with its bare web addresses made links. Nested in a Text, so it wraps with the words around it. */
export function Linked({ text }: { text: string }) {
  const c = useTheme();
  const open = useOpen();
  return text.split(URL_IN_TEXT).map((part, i) =>
    i % 2 ? (
      <RNText
        key={i}
        accessibilityRole="link"
        onPress={() => {
          tick();
          open(part);
        }}
        style={{ color: c.neoText, textDecorationLine: "underline" }}
      >
        {part}
      </RNText>
    ) : (
      part
    ),
  );
}

/** A notice as it was written: its paragraphs and bulleted lists, bold, italics and links kept. */
export function PlanText({ blocks }: { blocks: PlanBlock[] }) {
  const c = useTheme();
  const open = useOpen();
  // Items next to each other make one list.
  const groups: { kind: "p" | "li"; blocks: PlanBlock[] }[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.kind === "li" && last?.kind === "li") last.blocks.push(b);
    else groups.push({ kind: b.kind, blocks: [b] });
  }
  const runs = (b: PlanBlock) =>
    b.runs.map((r, i) => {
      const style = [r.b && { fontWeight: "600" as const, color: c.text1 }, r.i && { fontStyle: "italic" as const }];
      return r.href ? (
        <RNText
          key={i}
          accessibilityRole="link"
          onPress={() => {
            tick();
            open(r.href!);
          }}
          style={[style, { color: c.neoText, textDecorationLine: "underline" }]}
        >
          {r.t}
        </RNText>
      ) : (
        <RNText key={i} style={style}>
          <Linked text={r.t} />
        </RNText>
      );
    });
  return (
    <View style={{ gap: space[2] }}>
      {groups.map((g, i) =>
        g.kind === "li" ? (
          <Bullets key={i} items={g.blocks.map(runs)} />
        ) : (
          <Text key={i} variant="bodySm" tone="2" selectable>
            {runs(g.blocks[0]!)}
          </Text>
        ),
      )}
    </View>
  );
}

/** A bulleted list as the web's notices draw one (.neo-bullets): a quiet disc in the third ink, the words in the second. */
export function Bullets({ items }: { items: ReactNode[] }) {
  const c = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space[2], paddingLeft: space[1] }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.text3, marginTop: 8 }} />
          <Text variant="bodySm" tone="2" style={{ flex: 1 }} selectable>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}
