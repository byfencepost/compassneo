import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { ChevronLeft, ChevronRight, Icon, Today } from "@/components/glaze/icon";
import { dayName, shortDate } from "@/lib/neo/days";
import { spring } from "@/lib/neo/motion";

/**
 * The day, right under its classes: a day back, the day shown, a day on, and a way back to today that comes into
 * focus beside them once you have left it. The day's name turns over the way the day moved.
 */
export function DayPicker({
  day,
  today,
  dir,
  onMove,
  onToday,
}: {
  day: string;
  today: string;
  dir: number;
  onMove: (by: -1 | 1) => void;
  onToday: () => void;
}) {
  const away = day !== today;
  const name = dayName(day, today);
  return (
    <nav aria-label="Day" className="mt-3 flex items-center justify-center gap-1">
      <motion.div layout="position" transition={spring.morph}>
        <Button variant="ghost" size="icon" aria-label="Day before" onClick={() => onMove(-1)}>
          <Icon icon={ChevronLeft} weight="bold" />
        </Button>
      </motion.div>
      <motion.div layout transition={spring.morph} className="relative grid min-w-32 place-items-center overflow-hidden text-center">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={day}
            custom={dir}
            variants={turn}
            initial="from"
            animate="at"
            exit="gone"
            transition={spring.snap}
            className="flex items-baseline gap-1.5 whitespace-nowrap"
            aria-live="polite"
          >
            <span className="neo-day-name text-text-1">{name}</span>
            {/* A name like "Today" or "Friday" gets its date beside it; a far day's name has the date in it already. */}
            {!/\d/.test(name) && <span className="type-caption text-text-3">{shortDate(day)}</span>}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      <motion.div layout="position" transition={spring.morph}>
        <Button variant="ghost" size="icon" aria-label="Day after" onClick={() => onMove(1)}>
          <Icon icon={ChevronRight} weight="bold" />
        </Button>
      </motion.div>
      <AnimatePresence initial={false} mode="popLayout">
        {away && (
          <motion.div
            key="today"
            layout
            initial={{ opacity: 0, scale: 0.6, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.6, filter: "blur(6px)" }}
            transition={spring.snap}
          >
            <Button size="sm" variant="secondary" onClick={onToday}>
              <Icon icon={Today} />
              Today
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

const turn = {
  from: (dir: number) => ({ opacity: 0, y: dir * 12, filter: "blur(4px)" }),
  at: { opacity: 1, y: 0, filter: "blur(0px)" },
  gone: (dir: number) => ({ opacity: 0, y: dir * -12, filter: "blur(4px)" }),
};
