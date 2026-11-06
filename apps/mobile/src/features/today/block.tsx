import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Card } from "@/components/ui/card";
import type { Lesson } from "@/lib/timetable";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import type { Cell, LessonCell } from "./day";
import { AssemblyCell, DoneCell, RowCell, TileCell } from "./cells";
import { HeroCell } from "./hero";

/** What a cell is drawn as, so a lesson that changes shape (a row becoming the hero, the hero going over) is a new cell. */
const shapeOf = (cell: Cell) => (cell.kind === "lesson" ? cell.size : cell.kind === "assembly" ? (cell.done ? "done" : "on") : "pair");

/**
 * One school day as a single block, as the web draws it (the day view's neo-stack): a card holding every lesson, split
 * by hairlines, biggest first. The hero, the two rows after it, the rest as tiles two to a row (a hairline between the
 * pair too), any assembly at its time among them, and what is over today at the foot. The card's paper clips each
 * cell to its corners, so the class on now's wash follows the card's own curve.
 *
 * A cell that arrives after the block did comes into focus where it sits, top to bottom a beat apart: the day's
 * classes landing in place of the skeleton, or the ones that changed shape as the clock moved (the hero going over,
 * the next class taking its place). Cells that only moved simply sit in their new place; the block's first paint is
 * held still by the day around it (see ./day-view).
 */
export function Block({ cells, now, isToday, zone, onOpen }: { cells: Cell[]; now: number; isToday: boolean; zone: string; onOpen?: (l: Lesson) => void }) {
  const c = useTheme();
  const lesson = (cell: LessonCell) => {
    const open = onOpen && (() => onOpen(cell.lesson));
    if (cell.size === "hero") return <HeroCell lesson={cell.lesson} now={now} isToday={isToday} zone={zone} onOpen={open} />;
    if (cell.size === "done") return <DoneCell lesson={cell.lesson} zone={zone} onOpen={open} />;
    if (cell.size === "tile") return <TileCell lesson={cell.lesson} zone={zone} onOpen={open} />;
    return <RowCell lesson={cell.lesson} zone={zone} onOpen={open} />;
  };
  return (
    <Card padded={false}>
      {cells.map((cell, i) => (
        <Animated.View key={`${cell.key}:${shapeOf(cell)}`} entering={focusIn(i)} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.line } : undefined}>
          {cell.kind === "lesson" ? (
            lesson(cell)
          ) : cell.kind === "assembly" ? (
            <AssemblyCell assembly={cell.assembly} zone={zone} done={cell.done} />
          ) : (
            <View style={{ flexDirection: "row" }}>
              {lesson(cell.left)}
              <View style={{ width: 1, backgroundColor: c.line }} />
              {lesson(cell.right)}
            </View>
          )}
        </Animated.View>
      ))}
    </Card>
  );
}
