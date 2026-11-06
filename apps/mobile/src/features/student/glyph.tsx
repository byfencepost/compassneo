import { View, type ColorValue } from "react-native";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";

/**
 * The student pages' glyphs, after the web's Glaze icons (apps/web/app/components/glaze/icon.tsx): SF Symbols on iOS,
 * Material Symbols on Android, named once here so a page asks for "excursion" and gets each platform's bus.
 *
 * Filled, as the web's are (Solar Bold): the pages themselves, a section's heading, a kind of event, a Chronicle
 * entry's rating. In line only where SF Symbols has no fill (the calendar, the rosette) or the glyph is line-art that
 * reads better thin (the chart, the clock).
 */
const GLYPHS = {
  attendance: ["person.crop.circle.fill.badge.checkmark", "how_to_reg"],
  // No filled calendar in SF Symbols: the disc keeps it as solid as attendance and Chronicle beside it.
  events: ["calendar.circle.fill", "calendar_month"],
  chronicle: ["text.book.closed.fill", "book"],
  calm: ["cup.and.saucer.fill", "coffee"],
  school: ["building.columns.fill", "school"],
  calendar: ["calendar", "calendar_month"],
  chart: ["chart.xyaxis.line", "show_chart"],
  grid: ["tablecells.fill", "table_chart"],
  warning: ["exclamationmark.triangle.fill", "warning"],
  check: ["checkmark", "check"],
  lock: ["lock.fill", "lock"],
  time: ["clock", "schedule"],
  // An event's kind.
  event: ["flag.fill", "flag"],
  excursion: ["bus.fill", "directions_bus"],
  workshop: ["lightbulb.fill", "lightbulb"],
  meeting: ["bubble.left.and.bubble.right.fill", "forum"],
  assembly: ["mic.fill", "mic"],
  activity: ["balloon.fill", "celebration"],
  schoolCalendar: ["calendar.badge.clock", "today"],
  exam: ["list.clipboard.fill", "assignment_turned_in"],
  club: ["person.3.fill", "groups"],
  // A Chronicle entry.
  housePoints: ["star.fill", "star"],
  commendation: ["hand.thumbsup.fill", "thumb_up"],
  grade: ["rosette", "workspace_premium"],
  failed: ["xmark.circle.fill", "cancel"],
  letter: ["envelope.fill", "mail"],
  info: ["info.circle.fill", "info"],
  notice: ["bell.fill", "notifications"],
} as const satisfies Record<string, readonly [SFSymbol, AndroidSymbol]>;

export type GlyphName = keyof typeof GLYPHS;

/** A glyph in a colour. Only a picture: the row or the label beside it says it in words. */
export function Glyph({ name, size = 16, color }: { name: GlyphName; size?: number; color: ColorValue }) {
  const [ios, android] = GLYPHS[name];
  return (
    <SymbolView
      name={{ ios, android, web: android }}
      size={size}
      tintColor={color}
      weight="medium"
      accessible={false}
      importantForAccessibility="no"
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}
