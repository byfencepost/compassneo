import { useState } from "react";
import { Button } from "@/components/glaze/ui/button";
import { Attendance as AttendanceGlyph } from "@/components/glaze/icon";
import { SourceMark } from "@/components/brand/source-mark";
import { shortDate } from "@/lib/neo/days";
import { useAttendance } from "@/lib/neo/student";
import { markLabel, markOf, weekdayIndex } from "@/features/student/format";
import { Block, Row } from "./sections";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** What it was: a late says so ("Late · unexplained"); an absence is its reason, else its kind. */
export const whatOf = (a: { code: string; name: string; reason: string | null }) =>
  a.code === "L" ? `Late${a.reason ? ` · ${a.reason.toLowerCase()}` : ""}` : (a.reason ?? markLabel(a.name));

/** Shown at first; the rest behind "Show all". */
const FIRST = 4;

/**
 * This class's absences and lates this year, from Compass's rolls (convex/attendance.ts): when, why (Compass's reason,
 * "Sick", an excursion's name), and the period. Only when there are some.
 */
export function ClassAbsencesBlock({ token, code }: { token: string; code: string }) {
  const [all, setAll] = useState(false);
  const items = (useAttendance(token).data?.compass?.absences ?? [])
    .map(a => ({ ...a, here: a.classes.filter(c => c.classCode === code) }))
    .filter(a => a.here.length > 0);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, FIRST);

  return (
    <Block icon={AttendanceGlyph} title="Absences and lates" aside={<SourceMark source="compass" size={14} />}>
      {shown.map(a => {
        const mark = markOf(a.code, a.name);
        const periods = a.here.map(c => c.period).filter((p): p is number => p != null);
        return (
          <Row key={`${a.date}|${a.code}|${a.reason ?? ""}`}>
            <div className="flex items-center gap-3">
              <span data-mark={mark} className="neo-st-mark neo-st-key" />
              <span className="min-w-0 flex-1 truncate type-label text-text-1">{whatOf(a)}</span>
              {periods.length > 0 && (
                <span className="neo-tabular shrink-0 type-caption text-text-3">
                  {periods.length === 1 ? `Period ${periods[0]}` : `Periods ${periods.join(", ")}`}
                </span>
              )}
              <span className="neo-tabular w-20 shrink-0 text-end type-label-sm text-text-2">
                {WEEKDAYS[weekdayIndex(a.date)]} {shortDate(a.date)}
              </span>
            </div>
          </Row>
        );
      })}
      {items.length > FIRST && (
        <div className="border-t border-line-faint px-2 py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setAll(v => !v)}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        </div>
      )}
    </Block>
  );
}
