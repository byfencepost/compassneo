import { useEffect, useState } from "react";
import { motion, type PanInfo } from "motion/react";
import { Button } from "@/components/glaze/ui/button";
import { Icon, SignOut } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { useArrival } from "@/lib/neo/arrive";
import { addDays, dayIn, daysApart, zoneOf } from "@/lib/neo/days";
import { morph } from "@/lib/neo/morph";
import { useEndGuest, type Guest } from "@/lib/neo/session";
import { useAutoSync } from "@/lib/neo/sync";
import { useNow } from "@/lib/neo/time";
import { useDay } from "@/lib/neo/timetable";
import { Face } from "@/features/home/profile";
import { DayView } from "@/features/timetable/day-view";
import { DayPicker } from "@/features/timetable/day-picker";

/** How far a swipe has to travel, or how fast, to turn the day (as on home). */
const SWIPE_PX = 70;
const SWIPE_SPEED = 500;

/**
 * Home while a guest is on (guest mode: a friend checking their timetable on this device): their day and nothing
 * else. Under a banner at the top saying whose it is, with Sign out, which hands the device straight back to its own
 * account (no asking: nothing is lost, and the friend is standing right there). The day is home's, relief teachers,
 * room changes and assemblies and all, turned the same ways (the dock, a swipe, the arrow keys and T), but its lessons
 * open nothing, and the guest's marks are not on it (the server leaves them off, convex/timetable.ts). Their days are
 * never kept on the device (useDay's keep), and while they look their account is kept synced, as home keeps its own.
 */
export function GuestHome({ guest }: { guest: Guest }) {
  const { me, token } = guest;
  const endGuest = useEndGuest();
  const arrival = useArrival();
  const zone = zoneOf(me.slug);
  const now = useNow(15_000);
  const today = dayIn(zone, now);
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const [dir, setDir] = useState(0);

  const shown = useDay(token, day, { keep: false });
  useDay(token, addDays(day, -1), { keep: false });
  useDay(token, addDays(day, 1), { keep: false });

  // The guest's sign-in gone behind the device's back (their password changed) just ends guest mode.
  useAutoSync(token, { onGone: () => void endGuest() });

  const goTo = (next: string) => {
    if (next === day) return;
    setDir(Math.sign(daysApart(day, next)));
    setPicked(next === today ? null : next);
  };
  const move = (by: -1 | 1) => goTo(addDays(day, by));
  const toToday = () => goTo(today);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable], [role=radiogroup], [role=tablist]")) return;
      if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "t" || e.key === "T") toToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const swiped = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX || info.velocity.x < -SWIPE_SPEED) move(1);
    else if (info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_SPEED) move(-1);
  };

  // The device's own home is wiped in over the guest's, as a change of route is.
  const leave = () => void morph(() => void endGuest(), "route");
  const name = me.fullName ?? me.displayName;

  return (
    <div data-route="home" className="min-h-dvh bg-page">
      <header className="neo-topbar sticky top-0 z-20">
        <div className="neo-column mx-auto w-full px-4 neo-safe-top pb-3">
          <section aria-label="Guest mode" className="neo-guest-banner flex items-center gap-3 py-2 ps-2.5 pe-2">
            <Face me={me} className="size-9" textClassName="type-label-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate type-label text-text-1">{name}</p>
              <p className="truncate type-caption text-text-2">Guest mode · {me.formGroup ? `Form ${me.formGroup}` : me.schoolName}</p>
            </div>
            <Button size="sm" onClick={leave}>
              <Icon icon={SignOut} />
              Sign out
            </Button>
          </section>
        </div>
      </header>

      <main onAnimationEnd={arrival.onAnimationEnd} className={cn("neo-column mx-auto w-full px-4 pb-16", arrival.className)}>
        <h1 className="sr-only">{name}'s classes</h1>
        <motion.div drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={0.22} onDragEnd={swiped} className="touch-pan-y">
          <DayView
            day={shown.day}
            loading={shown.loading}
            dayKey={day}
            now={now}
            isToday={day === today}
            zone={zone}
            dir={dir}
            selected={null}
            onNextDay={() => move(1)}
          />
        </motion.div>
        <DayPicker day={day} today={today} dir={dir} onMove={move} onToday={toToday} />
      </main>
    </div>
  );
}
