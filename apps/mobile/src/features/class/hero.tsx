import { View } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { Skeleton } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { radius, space } from "@/theme/tokens";
import { TeacherFace } from "./bits";
import type { Person } from "./data";
import { Glyph } from "./glyph";
import { useHue } from "./kit";

/**
 * The top of the class, as the web's class panel heads it (apps/web/app/features/class/class-panel.tsx): no card, just
 * the name in a heading on the page's top glow, and under it two dense lines: the code on a swatch of the class's
 * colour with its teachers' faces and names (and the subject, when the name is not it), then the next lesson. While
 * the detail loads, the code stands in for the name and a bar for the teachers; when it lands, the teachers and the
 * next lesson come into focus where they sit (no glass here, so they may fade). What is known on the first frame is
 * simply there.
 */
export function ClassHero({
  name,
  code,
  subject,
  teachers,
  next,
  loading,
  onNameLayout,
}: {
  name: string;
  code: string;
  subject: string | null;
  teachers: Person[];
  /** "Next: Thursday P3, Room B12". */
  next: string | null;
  loading: boolean;
  /** Where the name's foot sits in the hero, so the navigation bar can take the name once it scrolls away. */
  onNameLayout?: (bottom: number) => void;
}) {
  const c = useTheme();
  const hue = useHue();
  const faces = teachers.slice(0, 3);
  const names = teachers
    .slice(0, 2)
    .map(p => p.full ?? p.name)
    .join(", ");
  const aside = subject && subject !== name ? subject : null;
  return (
    <LayoutAnimationConfig skipEntering>
      <View style={{ gap: space[1.5], paddingHorizontal: space[1] }}>
        <View onLayout={e => onNameLayout?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <Text variant="heading" accessibilityRole="header" numberOfLines={2} style={{ fontSize: 22, lineHeight: 27, letterSpacing: -0.3 }}>
            {name}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 24 }}>
          <View style={{ backgroundColor: hue.fill, borderRadius: radius.tag, borderCurve: "continuous", paddingHorizontal: space[1.5], paddingVertical: 1 }}>
            <Text variant="caption" color={hue.on} style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.2 }} accessibilityLabel={`Class code ${code}`}>
              {code}
            </Text>
          </View>
          {loading && !teachers.length ? (
            <Skeleton height={12} width="45%" />
          ) : (
            <Animated.View entering={focusIn()} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[2] }}>
              {faces.length > 0 && (
                <View style={{ flexDirection: "row" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {faces.map((p, i) => (
                    <View key={p.code || p.full || p.name} style={{ marginLeft: i ? -6 : 0, zIndex: faces.length - i }}>
                      <TeacherFace person={p} size={22} ring={c.page} />
                    </View>
                  ))}
                </View>
              )}
              {(names || aside) && (
                <Text
                  variant="bodySm"
                  tone="2"
                  numberOfLines={1}
                  style={{ flex: 1 }}
                  accessibilityLabel={[teachers.length && `Taught by ${teachers.map(p => p.full ?? p.name).join(", ")}`, aside].filter(Boolean).join(". ")}
                >
                  {names && (
                    <Text variant="bodySm" style={{ fontWeight: "500" }}>
                      {names}
                      {teachers.length > 2 && ` +${teachers.length - 2}`}
                    </Text>
                  )}
                  {names && aside && " · "}
                  {aside}
                </Text>
              )}
            </Animated.View>
          )}
        </View>

        {next && (
          <Animated.View entering={focusIn()} style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
            <Glyph name="clock" size={13} color={hue.accent} />
            <Text variant="caption" tone="2" numberOfLines={1} style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
              {next}
            </Text>
          </Animated.View>
        )}
      </View>
    </LayoutAnimationConfig>
  );
}
