import { useId, useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Chevron, Fold } from "@/components/ui/fold";
import { GlassChip, Icon, Segmented } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { Swap } from "@/features/grades/moving";
import { clock, dayIn, dayName } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import type { Notice } from "./data";
import { NoticeFile } from "./notice-file";
import { Bullets, Linked, PlanText } from "./text";

/**
 * One notice, a row in its day's card, as the web's notices page has it (apps/web/app/features/student/notices.tsx):
 * its title (Important first when Compass marks it so), when and who posted it, then Claude's reading of it (the summary
 * and its bullet points) or the notice as it was written, a switch away, never both at once. One Claude has not read
 * (yet, or at all) is only the original. Its files follow either way. The switch is a small glass segmented control,
 * as wide as its two words.
 *
 * The title row opens and shuts the rest on the shared Fold. The latest day's notices start open, as the web shows
 * them; earlier ones start shut, a line of their summary showing until opened. Switching between the summary and the
 * original, the words give way to the others in place, a quick fade into focus as the web's does (the switch itself
 * and "Show all" are glass, so they stay outside what fades).
 */
export function NoticeItem({ notice: n, today, zone, defaultOpen }: { notice: Notice; today: string; zone: string; defaultOpen: boolean }) {
  const c = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const [view, setView] = useState<"summary" | "original">("summary");
  const [whole, setWhole] = useState(false);
  const posted = dayIn(zone, n.at);
  const when = posted === today ? clock(n.at, zone) : dayName(posted, today);
  const bullets = n.bullets?.length ? n.bullets : null;
  const read = !!(bullets || n.summary);
  const original = !!(n.blocks?.length || n.text.trim());
  const showing = read ? view : "original";
  const preview = n.summary ?? (n.status === "pending" ? "Claude is summing this up…" : n.text.trim().split("\n")[0]);
  const long = isLong(n);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[n.important ? "Important" : null, n.title, when, n.by].filter(Boolean).join(", ")}
        accessibilityHint={open ? "Hides the notice" : "Shows the notice"}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          setOpen(o => !o);
        }}
        style={({ pressed }) => [{ flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }, pressed && { backgroundColor: c.lineFaint }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[3] }}>
            <Text variant="label" style={{ flex: 1, fontWeight: "600" }}>
              {n.important && <Text variant="label" tone="warn" style={{ fontWeight: "600" }}>{"Important\u2002"}</Text>}
              {n.title}
            </Text>
            <Text variant="caption" tone="3" style={{ fontVariant: ["tabular-nums"] }}>
              {when}
            </Text>
          </View>
          {n.by && (
            <Text variant="caption" tone="3" numberOfLines={1}>
              {n.by}
            </Text>
          )}
          {/* Shut, a line of what it says; opened, that gives way to the whole of it. */}
          {!!preview && (
            <Fold open={!open}>
              <Text variant="bodySm" tone="2" numberOfLines={2} style={{ paddingTop: 2 }}>
                {preview}
              </Text>
            </Fold>
          )}
        </View>
        <View style={{ paddingTop: 4 }}>
          <Chevron open={open} />
        </View>
      </Pressable>

      <Fold open={open}>
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[3], gap: space[2] }}>
          {read && original && (
            <Segmented
              label={`Show ${n.title} as`}
              options={[
                { value: "summary", label: "Summary" },
                { value: "original", label: "Original" },
              ]}
              value={view}
              onChange={setView}
              size="sm"
            />
          )}

          <Swap id={showing}>
            {showing === "summary" ? (
              <View style={{ gap: space[1.5] }}>
                {n.summary && (
                  <Text variant="bodySm" selectable>
                    <Linked text={n.summary} />
                  </Text>
                )}
                {bullets && <Bullets items={bullets.map((b, i) => <Linked key={i} text={b} />)} />}
                <Text variant="caption" tone="3">
                  Summarised by Claude
                </Text>
              </View>
            ) : (
              <View style={{ gap: space[1.5] }}>
                {n.status === "pending" && (
                  <Text variant="caption" tone="3">
                    Claude is summing this up…
                  </Text>
                )}
                {original ? (
                  <Original notice={n} clipped={long && !whole} />
                ) : (
                  <Text variant="bodySm" tone="3">
                    Nothing more in this one.
                  </Text>
                )}
              </View>
            )}
          </Swap>
          {showing === "original" && original && long && (
            <View style={{ alignSelf: "flex-start" }}>
              <GlassChip
                size="sm"
                label={whole ? "Show less" : "Show all"}
                icon={<Icon ios={whole ? "chevron.up" : "chevron.down"} android={whole ? "expand_less" : "expand_more"} size={10} color={c.text1} weight="semibold" />}
                expanded={whole}
                onPress={() => setWhole(w => !w)}
              />
            </View>
          )}
        </View>

        {n.attachments.length > 0 && (
          <View style={{ paddingBottom: space[1] }}>
            {n.attachments.map((f, i) => (
              <NoticeFile key={`${f.name}-${i}`} file={f} />
            ))}
          </View>
        )}
      </Fold>
    </View>
  );
}

/** A notice this long (in characters, or paragraphs and items) is cut short under "Show all" until asked for. */
const LONG_CHARS = 700;
const LONG_BLOCKS = 9;
/** How much of a long notice shows before "Show all": about a dozen lines, the last few fading out. */
const CLIP = 300;
const FADE = 72;

/** A notice long enough (in characters, or paragraphs and items) to be cut short under "Show all" until asked for. */
function isLong(n: Notice) {
  const blocks = n.blocks?.length ? n.blocks : null;
  return n.text.length > LONG_CHARS || (blocks ? blocks.length > LONG_BLOCKS : n.text.split(/\n/).length > LONG_BLOCKS);
}

/** The notice as it was written: its own blocks where kept, else its plain words, line by line; `clipped`, cut short. */
function Original({ notice: n, clipped }: { notice: Notice; clipped: boolean }) {
  const c = useTheme();
  const fade = `fade${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const blocks = n.blocks?.length ? n.blocks : null;
  return (
    <View style={clipped ? { maxHeight: CLIP, overflow: "hidden" } : undefined}>
      {blocks ? (
        <PlanText blocks={blocks} />
      ) : (
        <Text variant="bodySm" tone="2" selectable>
          <Linked text={n.text.trim()} />
        </Text>
      )}
      {clipped && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: CLIP - FADE, height: FADE }}>
          <Svg width="100%" height={FADE}>
            <Defs>
              <LinearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.paper} stopOpacity={0} />
                <Stop offset="1" stopColor={c.paper} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height={FADE} fill={`url(#${fade})`} />
          </Svg>
        </View>
      )}
    </View>
  );
}
