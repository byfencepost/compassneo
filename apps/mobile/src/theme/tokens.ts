import { brand } from "@compassneo/brand";

/**
 * Compass Neo's design tokens for React Native, from the web's Glaze tokens (apps/web/app/components/glaze/tokens.css)
 * and class colours (apps/web/app/components/brand/brand.css). Surfaces and ink are neutral; Neo blue is only ever
 * the accent. A card is a grey shell with a paper panel inside it, 3px in, corners concentric.
 */

export type Palette = {
  dark: boolean;
  /** The page behind everything. */
  page: string;
  /** A card's shell, and its footer row. */
  shell: string;
  /** The panel inside a card, a sheet, a field. */
  paper: string;
  /** A grey well: a track, a skeleton. */
  field: string;
  /** Primary, secondary and placeholder text. */
  text1: string;
  text2: string;
  text3: string;
  textDisabled: string;
  /** Text on solid ink (a primary button). */
  textInverse: string;
  /** Solid ink: the primary button's fill. */
  ink: string;
  lineFaint: string;
  line: string;
  lineControl: string;
  lineFocus: string;
  neo: string;
  neoText: string;
  needle: string;
  ok: string;
  okText: string;
  okTint: string;
  warn: string;
  warnText: string;
  warnTint: string;
  fail: string;
  failText: string;
  failTint: string;
};

export const day: Palette = {
  dark: false,
  page: "#FBFBFA",
  shell: "#F1F1F0",
  paper: "#FFFFFF",
  field: "#EFEFEF",
  text1: "rgba(5,5,5,0.80)",
  text2: "rgba(5,5,5,0.60)",
  text3: "rgba(5,5,5,0.45)",
  textDisabled: "rgba(5,5,5,0.32)",
  textInverse: "#FFFFFF",
  ink: "#050505",
  lineFaint: "rgba(5,5,5,0.06)",
  line: "rgba(5,5,5,0.10)",
  lineControl: "rgba(5,5,5,0.15)",
  lineFocus: "rgba(0,112,224,0.72)",
  neo: brand.neo,
  neoText: "#0067D1",
  needle: brand.needle,
  ok: "#2C9A59",
  okText: "#1A7640",
  okTint: "#E6F4EA",
  warn: "#D98A0B",
  warnText: "#8A5A00",
  warnTint: "#FBF0D9",
  fail: "#E35E49",
  failText: "#B23C29",
  failTint: "#FBE9E5",
};

export const night: Palette = {
  dark: true,
  page: "#0C0C0C",
  shell: "#161616",
  paper: "#1F1F1F",
  field: "#2A2A2A",
  text1: "#F4F4F3",
  text2: "rgba(244,244,243,0.60)",
  text3: "rgba(244,244,243,0.45)",
  textDisabled: "rgba(244,244,243,0.34)",
  textInverse: "#050505",
  ink: "#F4F4F3",
  lineFaint: "rgba(244,244,243,0.06)",
  line: "rgba(244,244,243,0.10)",
  lineControl: "rgba(244,244,243,0.15)",
  lineFocus: "rgba(77,163,255,0.8)",
  neo: "#0A84FF",
  neoText: "#5AAAFF",
  needle: brand.needle,
  ok: "#3FBF75",
  okText: "#6FD69A",
  okTint: "#13261A",
  warn: "#F0A531",
  warnText: "#F5C065",
  warnTint: "#2A2010",
  fail: "#EC6F5A",
  failText: "#F2917F",
  failTint: "#2C1714",
};

/**
 * The twelve class colours (a lesson's `hue`, from convex/lib/match.ts), converted from brand.css's OKLCH.
 * fill: a solid swatch (the class on now, a room pill), with `on` the ink that reads on it.
 * light/dark: the accent for anything drawn straight on the page (a stripe, a glyph, a ring) in each theme.
 */
export const HUES = [
  { name: "red", fill: "#f1383e", light: "#d81327", dark: "#ff5b59", on: "#fff" },
  { name: "orange", fill: "#f77200", light: "#cd4b00", dark: "#ff8928", on: "#fff" },
  { name: "amber", fill: "#ffb90e", light: "#ba7600", dark: "#ffb90e", on: "#1a1a1a" },
  { name: "lime", fill: "#b3e635", light: "#659200", dark: "#b3e635", on: "#1a1a1a" },
  { name: "green", fill: "#00ad43", light: "#008d21", dark: "#43d066", on: "#fff" },
  { name: "mint", fill: "#6ce5b5", light: "#009267", dark: "#6ce5b5", on: "#1a1a1a" },
  { name: "teal", fill: "#009c96", light: "#007e78", dark: "#35c9c2", on: "#fff" },
  { name: "sky", fill: "#30c3ec", light: "#0080a7", dark: "#3ac9f3", on: "#1a1a1a" },
  { name: "blue", fill: "#217bf4", light: "#0061d8", dark: "#4ba2ff", on: "#fff" },
  { name: "indigo", fill: "#6159e1", light: "#4f42c9", dark: "#8a8aff", on: "#fff" },
  { name: "violet", fill: "#a95af1", light: "#8834cb", dark: "#cc7eff", on: "#fff" },
  { name: "pink", fill: "#e849b0", light: "#c11a8e", dark: "#ff68cd", on: "#fff" },
] as const;

export type ClassColor = { fill: string; on: string; accent: string; tint: string; line: string };

/** A class's colours in a theme. A missing or unknown hue falls back to Neo blue. */
export function classColor(hue: number | null | undefined, p: Palette): ClassColor {
  const h = hue != null ? HUES[((hue % HUES.length) + HUES.length) % HUES.length] : undefined;
  if (!h) return { fill: p.neo, on: "#fff", accent: p.neoText, tint: alpha(p.neo, 0.14), line: alpha(p.neo, 0.5) };
  const accent = p.dark ? h.dark : h.light;
  return { fill: h.fill, on: h.on, accent, tint: alpha(h.fill, p.dark ? 0.16 : 0.14), line: alpha(accent, 0.5) };
}

/** A #rrggbb colour at an alpha. */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Spacing on a 4pt grid. */
export const space = { 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/** Corner radii: pills for one-line controls, the shell and its panel 3px in. */
export const radius = { pill: 999, shell: 18, panel: 15, overlay: 12, tag: 7 } as const;

/** The gap between a card's shell and its panel. */
export const SHELL_INSET = 3;

/** Type scale (system font: SF Pro on iOS, Roboto on Android). */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.4 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.2 },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: "400" },
  /** A section's label: small and strong, in sentence case (Glaze never shouts in capitals). */
  overline: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  mono: { fontSize: 13, lineHeight: 17, fontWeight: "500", fontVariant: ["tabular-nums"] },
} as const;

export type TypeName = keyof typeof type;
