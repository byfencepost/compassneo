import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";

/**
 * A small system glyph: an SF Symbol on iOS, its Material Symbols twin on Android, so each phone draws its own. The
 * glyphs the day uses are named here once, in pairs, so the two platforms never drift apart. Each stands for the web's
 * Glaze icon of the same job (apps/web/app/components/glaze/icon.tsx).
 *
 * Filled where the web's is (Solar Bold): a thing or a state, a solid shape that holds its colour small. Outline for
 * the moves (the day arrows) and for the web's two line marks, the room switch and the relief, which ride beside a
 * name where a solid shape would read heavier than the word. The calendar has no filled SF Symbol, so it stays in line.
 */
export const GLYPHS = {
  back: { ios: "chevron.left", android: "chevron_left" },
  forward: { ios: "chevron.right", android: "chevron_right" },
  /** The web's Today (a calendar with its day marked). */
  today: { ios: "calendar", android: "today" },
  /** The web's RoomChange, in line: the room swapped today. */
  moved: { ios: "arrow.left.arrow.right", android: "swap_horiz" },
  /** The web's Relief, in line: another teacher covering. */
  relief: { ios: "person.2", android: "group" },
  /** The web's EventAssembly. */
  assembly: { ios: "mic.fill", android: "mic" },
  /** The web's NoClasses (confetti): nothing on, a weekend. */
  noClasses: { ios: "party.popper.fill", android: "celebration" },
  /** The web's DayDone (a sunset): today's classes are over. */
  done: { ios: "sunset.fill", android: "wb_twilight" },
  waiting: { ios: "clock.fill", android: "schedule" },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type GlyphName = keyof typeof GLYPHS;

/** Medium by default: a filled glyph at semibold reads heavier than the 12 to 16pt text beside it. */
export function Glyph({ name, size = 16, color, weight = "medium" }: { name: GlyphName; size?: number; color: string; weight?: "regular" | "medium" | "semibold" | "bold" }) {
  return <SymbolView name={GLYPHS[name]} size={size} tintColor={color} weight={weight} accessible={false} importantForAccessibility="no" />;
}
