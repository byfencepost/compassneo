import { Attendance, Chronicle, Events, type GlazeIcon } from "@/components/glaze/icon";
import { attendanceTone, toneHue } from "./format";

/** The student's own pages, opened from the shortcuts on home (shortcuts.tsx) into the side panel. */
export type StudentPage = "attendance" | "events" | "chronicle";

/** Each page's name, its glyph, and what it is called in a sentence ("Refresh attendance"). */
export const PAGES: Record<StudentPage, { title: string; icon: GlazeIcon; what: string }> = {
  attendance: { title: "Attendance", icon: Attendance, what: "attendance" },
  events: { title: "Events", icon: Events, what: "events" },
  chronicle: { title: "Chronicle", icon: Chronicle, what: "Chronicle" },
};

/**
 * Each page's colour, a class hue (brand.css): attendance wears its standing (green, amber or red, by the year's
 * share present), events Neo-ish blue, Chronicle violet. The panel's wash, its section glyphs and the tile on home.
 */
export function pageHue(page: StudentPage, percent: number | null | undefined) {
  if (page === "events") return 8;
  if (page === "chronicle") return 10;
  return toneHue[attendanceTone(percent ?? 100)];
}
