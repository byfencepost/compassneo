import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Text } from "@/components/ui/text";
import { dur } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { alpha, day, night, radius, space } from "@/theme/tokens";
import { KindGlyph, useOpen } from "./bits";
import { hostOf, linkKind, youtubeId, type Kind } from "./files";
import { Glyph } from "./glyph";
import { Press, ROW } from "./kit";

/**
 * A file or a link as a row, for Work's attachments and the Files tab: what it is (a file's kind in its colour, a
 * link's own site icon, a YouTube video's thumbnail), its name and a quiet line about it. The whole row opens it in
 * the in-app browser: a file through Compass Neo's file route, which needs no sign-in there. Without an address (a
 * file Compass Neo cannot link to) the row stays, dimmed, so the list still says it is there.
 */
export function FileRow({ name, meta, href, external, kind, aside, inset = 0 }: { name: string; meta: string | null; href: string | null; external: boolean; kind: Kind; aside?: ReactNode; inset?: number }) {
  const c = useTheme();
  const open = useOpen();
  const yt = external ? youtubeId(href) : null;
  const lead = yt ? <Thumb id={yt} kind={kind} /> : external ? <Favicon url={href} /> : <KindGlyph kind={kind} size={20} />;
  const body = (pressed: boolean) => (
    <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: space[4] + inset }, pressed && { backgroundColor: c.lineFaint }, !href && { opacity: 0.5 }]}>
      <View style={{ width: yt ? 46 : 24, alignItems: "center" }}>{lead}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="caption" tone="3" numberOfLines={1}>
          {meta ?? kind.label}
        </Text>
      </View>
      {aside}
      {href && external && <Glyph name="external" size={13} color={c.text3} />}
    </View>
  );
  if (!href) return <View accessible accessibilityLabel={`${name}, ${meta ?? kind.label}, cannot be opened here`}>{body(false)}</View>;
  return (
    <Press onPress={() => open(href)} role={external ? "link" : "button"} label={`${name}, ${meta ?? kind.label}`} hint={external ? "Opens the link" : "Opens the file"}>
      {({ pressed }) => body(pressed)}
    </Press>
  );
}

/** A site's own icon, on a small white plate so dark icons show on the dark theme too; the link glyph if it will not load. */
function Favicon({ url }: { url: string | null }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  if (!host || failed) return <KindGlyph kind={linkKind(url)} size={20} />;
  return (
    <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: day.paper, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Image source={{ uri: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` }} style={{ width: 16, height: 16 }} cachePolicy="memory-disk" onError={() => setFailed(true)} />
    </View>
  );
}

/** A video's own thumbnail, small, with a play mark; the video glyph if it does not load. */
function Thumb({ id, kind }: { id: string; kind: Kind }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <KindGlyph kind={kind} size={20} />;
  return (
    <View style={{ width: 46, height: 26, borderRadius: radius.tag, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <Image source={{ uri: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={dur.state} cachePolicy="memory-disk" onError={() => setFailed(true)} />
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: alpha(night.page, 0.6), alignItems: "center", justifyContent: "center" }}>
        <Glyph name="play" size={9} color={night.text1} />
      </View>
    </View>
  );
}
