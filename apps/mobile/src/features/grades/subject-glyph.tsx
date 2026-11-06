import { View } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

type Glyph = Extract<SymbolViewProps["name"], { ios?: unknown }>;

/**
 * A glyph for a subject, from the words in its name ("Year 10 Mathematics", "Physical Education General"), as the web
 * picks one (apps/web/app/lib/neo/subjects.ts): the first rule that matches wins, so the narrower ones come first
 * (Computer Programming before Technologies). SF Symbols on iOS, Material Symbols on Android. Filled, as the web's
 * subject glyphs are (Solar Bold), so a class's colour shows as a shape; the few with no fill (the laptop, the square
 * root, the runner, the note, the fork and knife) are solid enough as they are.
 */
const RULES: [RegExp, Glyph][] = [
  [/\b(homeroom|home room|form|hr|pastoral|tutor)\b/i, { ios: "person.2.fill", android: "groups" }],
  [/(comput|programming|coding|digital tech|software|robotic|information tech|\bict\b|\bit\b)/i, { ios: "laptopcomputer", android: "computer" }],
  [/(math|calculus|statistic|algebra)/i, { ios: "x.squareroot", android: "calculate" }],
  [/(english|literature|literacy|writing)/i, { ios: "book.fill", android: "menu_book" }],
  [/(health)/i, { ios: "heart.fill", android: "favorite" }],
  [/(physical ed|phys ed|\bpe\b|sport|outdoor ed|fitness)/i, { ios: "figure.run", android: "directions_run" }],
  [/(hass|humanities|history|geograph|civics|social)/i, { ios: "globe.asia.australia.fill", android: "public" }],
  [/(science|physics|chemistry|biology|psychology|\bstem\b)/i, { ios: "flask.fill", android: "science" }],
  [/(media|film|photograph)/i, { ios: "camera.fill", android: "photo_camera" }],
  [/(music|band|choir)/i, { ios: "music.note", android: "music_note" }],
  [/(drama|theatre|dance)/i, { ios: "theatermasks.fill", android: "theater_comedy" }],
  [/(\bart\b|arts|visual|painting|ceramic)/i, { ios: "paintpalette.fill", android: "palette" }],
  [/(french|japanese|chinese|mandarin|italian|indonesian|german|spanish|language|eal)/i, { ios: "character.bubble.fill", android: "translate" }],
  [/(food|hospitality|home ec|cooking)/i, { ios: "fork.knife", android: "restaurant" }],
  [/(law|legal|politic)/i, { ios: "building.columns.fill", android: "account_balance" }],
  [/(agricult|horticult|environment|marine)/i, { ios: "leaf.fill", android: "eco" }],
  [/(design|wood|metal|materials|engineering|textiles)/i, { ios: "hammer.fill", android: "construction" }],
  [/(business|econom|accounting|commerce|enterprise)/i, { ios: "briefcase.fill", android: "business_center" }],
  [/(technolog|tech\b)/i, { ios: "cpu.fill", android: "memory" }],
];
const OTHER: Glyph = { ios: "book.closed.fill", android: "auto_stories" };

export function glyphFor(...names: (string | null | undefined)[]): Glyph {
  const text = names.filter(Boolean).join(" ");
  return RULES.find(([re]) => re.test(text))?.[1] ?? OTHER;
}

/**
 * The main subjects, as the web's Grades row on home picks them (apps/web/app/lib/neo/subjects.ts): Maths, English,
 * Science and HASS, in that order, read from the class's name and its subject. Computing and STEM are never one,
 * whatever their names say. Where a subject sits among them (0 Maths to 3 HASS), or -1 for any other.
 */
const NOT_MAIN = /(comput|programming|coding|digital|\bstem\b|\bict\b)/i;
const MAIN: RegExp[] = [/\bmath(s|ematics)?\b/i, /\b(english|literature)\b/i, /\bscience\b/i, /\b(hass|humanities)\b/i];

export function mainSubject(...names: (string | null | undefined)[]): number {
  const text = names.filter(Boolean).join(" ");
  if (NOT_MAIN.test(text)) return -1;
  // HASS before Science: "Humanities and Social Sciences" is HASS.
  if (MAIN[3]!.test(text)) return 3;
  return MAIN.findIndex(re => re.test(text));
}

/**
 * A class's glyph in its colour: how a class is marked in a list (a glyph and its name in its colour, never a dot or a
 * bar on the edge). Only a picture; the row says the class in words.
 */
export function SubjectGlyph({ names, color, size = 18 }: { names: (string | null | undefined)[]; color: string; size?: number }) {
  return (
    <SymbolView
      name={glyphFor(...names)}
      size={size}
      tintColor={color}
      accessible={false}
      importantForAccessibility="no"
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}
