import { useOverviewGrades } from "@/lib/neo/overview";
import { GradeRings } from "./grade-rings";

/**
 * Grades on home, above the to-do list: one row, always there and never folded, of every subject's grade as its own
 * ring (grade-rings.tsx), centred. Pressing it opens Grades in the side panel (features/student/grades.tsx), where every
 * grade is gone through and every subject has a page of its own. A school without Connect has no row.
 */
export function GradesRow({ token, day, open, onOpen }: { token: string; day: string; open: boolean; onOpen: () => void }) {
  const data = useOverviewGrades(token, day);
  if (data === null || data?.status === "none") return null;
  if (data?.status === "ready" && !data.subjects.length) return null;
  const ready = data?.status === "ready" ? data : null;
  const note = data?.status === "loading" ? "Getting your grades from Connect" : data?.status === "unavailable" ? data.reason : null;

  return (
    <section aria-label="Grades" aria-busy={!data || undefined} className="mt-6">
      <div className="neo-stack neo-notice">
        {/* eslint-disable-next-line glaze/no-native-control -- a whole block that opens the grades: a Glaze Button would draw a pill inside the card */}
        <button
          type="button"
          aria-pressed={open}
          data-on={open || undefined}
          onClick={onOpen}
          className="neo-row-button flex w-full flex-col items-center px-2 py-2.5"
        >
          <span className="sr-only">Grades: </span>
          {ready ? (
            <GradeRings subjects={ready.subjects} />
          ) : note ? (
            <span className="px-2 py-2 text-center type-caption text-text-3">{note}</span>
          ) : (
            <span aria-hidden className="flex justify-center gap-x-2 py-1.5">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} className="flex w-16 flex-col items-center gap-1">
                  <span className="neo-st-skel size-12 rounded-pill" />
                  <span className="neo-st-skel h-3 w-8" />
                </span>
              ))}
            </span>
          )}
        </button>
      </div>
    </section>
  );
}
