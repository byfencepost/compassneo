import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { Arrive, Swap } from "@/features/grades/moving";
import { dayIn, dayName } from "@/lib/days";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { assemblyTime, gist, NOTICES_HUE, upcomingAssemblies, useAnnouncements } from "./data";

/**
 * The school's notices on home, under the classes, as the web's home has them (apps/web/app/features/home/
 * announcements.tsx): one row, never the notices themselves. It says what the latest day's notices come to, in Claude's
 * summary (or that Claude is still reading them, or their titles when it could not), and the next assembly that is for
 * the student. Pressing it opens the notices page, where everything else is. Hidden when there is nothing to show.
 *
 * It comes into focus when it first appears (there is no glass in it); when a new day's notices come in, what it says
 * gives way to the new words in place.
 */
export function NoticesRow({ token, today, zone, now }: { token: string; today: string; zone: string; now: number }) {
  const c = useTheme();
  const data = useAnnouncements(token);
  if (!data) return null;

  const next = upcomingAssemblies(data, today, now)[0];
  const latestDay = data.notices[0] ? dayIn(zone, data.notices[0].at) : null;
  const latest = latestDay ? data.notices.filter(n => dayIn(zone, n.at) === latestDay) : [];
  if (!latest.length && !next) return null;

  const when = latestDay ? dayName(latestDay, today) : null;
  const line = latest.length ? gist(latest) : null;
  const nextText = next ? `${next.title} · ${dayName(next.date, today)} ${assemblyTime(next, zone)}` : null;

  return (
    <Arrive>
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={["Notices", when, line, nextText ? `Next assembly: ${nextText}` : null].filter(Boolean).join(". ")}
          accessibilityHint="Opens the notices"
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            router.push("/notices");
          }}
          style={({ pressed }) => [{ flexDirection: "row", alignItems: "flex-start", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }, pressed && { backgroundColor: c.lineFaint }]}
        >
          <View style={{ paddingTop: 2 }}>
            <Icon ios="newspaper.fill" android="newspaper" size={16} color={classColor(NOTICES_HUE, c).accent} weight="medium" />
          </View>
          <Swap id={[when, line, nextText].join("|")} style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2] }}>
              <Text variant="label">Notices</Text>
              {when && (
                <Text variant="caption" tone="3" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {when}
                </Text>
              )}
            </View>
            {line && (
              <Text variant="bodySm" tone="2" numberOfLines={2} style={{ marginTop: 2 }}>
                {line}
              </Text>
            )}
            {next && nextText && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], marginTop: space[1.5] }}>
                <Icon ios="megaphone.fill" android="campaign" size={12} color={c.neoText} />
                <Text variant="caption" tone={next.maybe ? "2" : "1"} numberOfLines={1} style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
                  {nextText}
                </Text>
              </View>
            )}
          </Swap>
          <View style={{ paddingTop: 3 }}>
            <Icon ios="chevron.right" android="chevron_right" size={14} color={c.text3} weight="semibold" />
          </View>
        </Pressable>
      </Card>
    </Arrive>
  );
}
