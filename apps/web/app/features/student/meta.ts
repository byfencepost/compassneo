import { Attendance, ChartLine, Chronicle, Events, Notice, type GlazeIcon } from "@/components/glaze/icon";
import { attendanceTone, toneHue } from "./format";

/**
 * The student's own pages, opened into the side panel: attendance, events and Chronicle from the shortcuts on home
 * (shortcuts.tsx), grades from their row above the to-do list (features/home/grades-row.tsx), the school's notices from
 * their row under the classes (features/home/announcements.tsx).
 */
export type StudentPage = "attendance" | "events" | "chronicle" | "notices" | "grades";

/** Each page's name, its glyph, and what it is called in a sentence ("Refresh attendance"). */
export const PAGES: Record<StudentPage, { title: string; icon: GlazeIcon; what: string }> = {
  attendance: { title: "Attendance", icon: Attendance, what: "attendance" },
  events: { title: "Events", icon: Events, what: "events" },
  chronicle: { title: "Chronicle", icon: Chronicle, what: "Chronicle" },
  notices: { title: "Notices", icon: Notice, what: "notices" },
  grades: { title: "Grades", icon: ChartLine, what: "grades" },
};

/**
 * Each page's colour, a class hue (brand.css): attendance wears its standing (green, amber or red, by the year's
 * share present), events Neo-ish blue, Chronicle violet, notices teal, grades sky. The panel's wash, its section
 * glyphs and the tile on home.
 */
export function pageHue(page: StudentPage, percent: number | null | undefined) {
  if (page === "events") return 8;
  if (page === "chronicle") return 10;
  if (page === "notices") return 6;
  if (page === "grades") return 7;
  return toneHue[attendanceTone(percent ?? 100)];
}
