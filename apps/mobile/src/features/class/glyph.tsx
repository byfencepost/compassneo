import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

/**
 * The class screen's glyphs: SF Symbols on iOS, Material Symbols on Android (both through expo-symbols, which Expo Go
 * carries), named once here so every screen asks for "folder" and gets each platform's own folder.
 *
 * Filled, as the web's are (Solar Bold), for things and states: a block's heading, a kind of file, a teacher, where a
 * piece of work stands. Outline for the moves and the marks that ride beside a word: chevrons and arrows, the link,
 * the paperclip, search, the hand-in action, the room switch and the relief (the web's two line glyphs), and the
 * line-art that has no fill or reads better thin (the line chart, the checklist, the waveform, the dotted "to do",
 * the clock). The calendar has no filled SF Symbol, so it stays in line too.
 */
const GLYPHS = {
  overview: ["square.grid.2x2.fill", "dashboard"],
  grade: ["chart.bar.fill", "insert_chart"],
  chart: ["chart.xyaxis.line", "show_chart"],
  target: ["scope", "flag"],
  work: ["checklist", "assignment"],
  files: ["books.vertical.fill", "library_books"],
  calendar: ["calendar", "calendar_month"],
  clock: ["clock", "schedule"],
  room: ["door.left.hand.open", "meeting_room"],
  roomMoved: ["arrow.left.arrow.right", "swap_horiz"],
  relief: ["person.2", "person"],
  teacher: ["person.crop.circle.fill", "person"],
  notice: ["megaphone.fill", "campaign"],
  plan: ["doc.text.fill", "description"],
  up: ["arrow.up.right", "trending_up"],
  down: ["arrow.down.right", "trending_down"],
  check: ["checkmark.circle.fill", "check_circle"],
  todo: ["circle.dotted", "hourglass_empty"],
  overdue: ["exclamationmark.circle.fill", "error"],
  lock: ["lock.fill", "lock"],
  info: ["info.circle.fill", "info"],
  warning: ["exclamationmark.triangle.fill", "warning"],
  pending: ["arrow.triangle.2.circlepath", "autorenew"],
  chevronDown: ["chevron.down", "expand_more"],
  chevronRight: ["chevron.right", "chevron_right"],
  external: ["arrow.up.forward", "arrow_outward"],
  attachment: ["paperclip", "attach_file"],
  upload: ["arrow.up.doc", "upload_file"],
  /** A folder as a heading or a label. */
  folder: ["folder.fill", "folder"],
  /** A folder's own row, shut and open: the fill marks the open one, as iOS fills a selection. */
  folderShut: ["folder", "folder"],
  folderOpen: ["folder.fill", "folder_open"],
  word: ["doc.richtext.fill", "description"],
  // A PDF wears the plan's page, as the web's PDF and Document are near twins: its red and its label tell it apart.
  pdf: ["doc.text.fill", "picture_as_pdf"],
  slides: ["rectangle.stack.fill", "slideshow"],
  sheet: ["tablecells.fill", "table_chart"],
  image: ["photo.fill", "image"],
  video: ["film.fill", "movie"],
  audio: ["waveform", "audio_file"],
  archive: ["doc.zipper", "folder_zip"],
  code: ["chevron.left.forwardslash.chevron.right", "code"],
  file: ["doc.fill", "draft"],
  link: ["link", "link"],
  play: ["play.rectangle.fill", "play_circle"],
  page: ["doc.plaintext.fill", "article"],
  task: ["checklist", "task"],
  talk: ["bubble.left.and.bubble.right.fill", "forum"],
  sparkle: ["sparkles", "grade"],
  search: ["magnifyingglass", "search"],
} as const satisfies Record<string, readonly [SFSymbol, AndroidSymbol]>;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, size = 16, color, style }: { name: GlyphName; size?: number; color: ColorValue; style?: StyleProp<ViewStyle> }) {
  const [ios, android] = GLYPHS[name];
  return (
    <SymbolView
      name={{ ios, android, web: android }}
      size={size}
      tintColor={color}
      weight="medium"
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
