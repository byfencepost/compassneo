import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Icon, School } from "@/components/glaze/icon";
import { persisted } from "@/lib/neo/store";
import { cn } from "@/lib/glaze/utils";
import { clock, dayIn, dayName } from "@/lib/neo/days";
import { lessonOfClass, nextOf, useClassList, type ListedClass } from "@/lib/neo/classlist";
import { SubjectGlyph, TeacherFace } from "@/features/timetable/class-card";
import { Donut } from "@/features/timetable/donut";

/** Whether the list is open, kept on this device. */
const openStore = persisted<boolean>("cneo.classlist.open.v1", true);

/**
 * Every class the student takes, under the day: one block of hairline rows like the day's, each with the class's
 * glyph in its colour, its name, its teacher, when it is next on and this semester's grade. Pressing one opens it in
 * the class panel, whether or not it is on the day being looked at; pressing the open one again puts the panel away.
 */
export function ClassList({
  token,
  day,
  today,
  zone,
  now,
  selected,
  onOpen,
}: {
  token: string;
  day: string;
  today: string;
  zone: string;
  now: number;
  /** The class open in the panel, by code. */
  selected: string | null;
  onOpen: (c: ListedClass, el: HTMLElement) => void;
}) {
  const classes = useClassList(token, day);
  const open = openStore.use();
  if (!classes?.length) return null;

  return (
    <section aria-labelledby="class-list-title" className="mt-6">
      <h2 id="class-list-title" className="mb-2">
        {/* eslint-disable-next-line glaze/no-native-control -- the section's own heading folds it: a Glaze Button would draw a pill around a heading */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="class-list"
          onClick={() => openStore.set(!open)}
          className="neo-fold-head flex w-full items-center gap-1.5 rounded-tag px-1 py-0.5 text-start type-label-sm text-text-2"
        >
          <Icon icon={School} size={14} />
          Classes
          {!open && <span className="neo-tabular text-text-3">{classes.length}</span>}
          <Icon icon={ChevronDown} size={14} className={cn("ms-auto transition-transform duration-150", !open && "-rotate-90")} />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="class-list"
            key="list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
      <ul className="neo-stack neo-notice flex flex-col">
        {classes.map((c, i) => {
          const next = nextOf(c, now);
          const when = next ? `${dayName(dayIn(zone, next.start), today)} ${clock(next.start, zone)}` : null;
          const on = selected === c.code;
          return (
            <li key={c.code} data-top={i > 0 || undefined} className="neo-cell">
              {/* eslint-disable-next-line glaze/no-native-control -- a whole row that opens its class: a Glaze Button would draw a pill inside the block */}
              <button
                type="button"
                data-hue={c.hue}
                aria-pressed={on}
                onClick={e => onOpen(c, e.currentTarget)}
                className={cn("neo-class-row flex h-13 w-full min-w-0 items-center gap-3 px-3.5 text-start", on && "neo-class-row-on")}
              >
                <SubjectGlyph lesson={lessonOfClass(c, now)} size={16} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-label text-text-1">{c.name}</span>
                  {c.teacher && (
                    <span className="flex min-w-0 items-center gap-1.5 type-caption text-text-3">
                      <TeacherFace person={c.teacher} className="size-3.5" textClassName="neo-face-text" />
                      <span className="truncate">{c.teacher.full ?? c.teacher.name}</span>
                    </span>
                  )}
                </span>
                {when && <span className="neo-tabular shrink-0 type-caption text-text-3">{when}</span>}
                {/* Only a class with a grade has the ring's slot: one without (homeroom) ends at its time, no gap. */}
                {c.grade?.percent != null && (
                  <span className="grid w-7 shrink-0 place-items-center">
                    <Donut percent={c.grade.percent} thickness={16} className="size-6" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
