import { useAction } from "convex/react";
import { motion } from "motion/react";
import { api } from "@compassneo/backend/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/glaze/ui/tooltip";
import { cn } from "@/lib/glaze/utils";
import { spring } from "@/lib/neo/motion";
import { isRunning, useSyncRun, type SyncRun } from "@/lib/neo/sync";
import { ago, useNow } from "@/lib/neo/time";
import { signOutNotice } from "@/lib/neo/session";

/** The gauge's span, as on the login's dial. */
const SWEEP = 150;

/** What the gauge says, for its tooltip and its name. */
export function syncLabel(run: SyncRun | null | undefined, now: number) {
  if (isRunning(run)) return "Syncing";
  if (!run?.finishedAt) return "Not synced yet";
  const partly = run.steps.some(s => s.status === "failed");
  return `${partly ? "Partly synced" : "Synced"} ${ago(run.finishedAt, now)}`;
}

/**
 * The sync, as the login's gauge in miniature and nothing else: an arc of bearings in the corner. Synced, they are all
 * lit in Neo blue (amber where a part failed). While a sync runs, the ones done are lit and the rest pulse in turn
 * along the arc, so it reads as working without saying what. Pressing it syncs now; its tooltip says when it last did.
 * The timetable on screen is always the last synced one, whatever the gauge is doing.
 */
export function SyncButton({ token }: { token: string }) {
  const run = useSyncRun(token);
  const syncNow = useAction(api.sync.now);
  const now = useNow();
  const running = isRunning(run);
  const label = syncLabel(run, now);

  const again = () =>
    void syncNow({ token, force: true })
      .then(r => {
        if (!r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
      })
      .catch(() => {});

  const steps = run?.steps ?? [];
  const n = Math.max(steps.length, 8);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.button
            type="button"
            onClick={running ? undefined : again}
            aria-busy={running || undefined}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            transition={spring.snap}
            className="grid size-(--control) place-items-center rounded-tag focus-visible:focus-ring"
          />
        }
      >
        <svg viewBox="0 0 32 18" className="w-5.5" fill="none" aria-hidden>
          {Array.from({ length: n }, (_, i) => {
            const s = steps[i];
            const deg = -SWEEP / 2 + (SWEEP * (i + 0.5)) / n;
            const a = ((deg - 90) * Math.PI) / 180;
            const [x1, y1, x2, y2] = [16 + 9 * Math.cos(a), 17 + 9 * Math.sin(a), 16 + 15 * Math.cos(a), 17 + 15 * Math.sin(a)];
            const lit = s ? s.status === "done" || s.status === "skipped" || (!running && s.status !== "failed") : !running && !!run?.finishedAt;
            const failed = s?.status === "failed";
            const pulsing = running && !lit && !failed;
            return (
              <line
                key={i}
                x1={x1.toFixed(2)}
                y1={y1.toFixed(2)}
                x2={x2.toFixed(2)}
                y2={y2.toFixed(2)}
                strokeWidth={2.2}
                strokeLinecap="round"
                style={pulsing ? { animationDelay: `${i * 90}ms` } : undefined}
                className={cn(
                  "stroke-current transition-colors duration-(--dur-state)",
                  failed ? "text-warn" : lit ? "text-neo" : running ? "text-neo-text" : "text-line-strong",
                  pulsing && "neo-tick-running",
                )}
              />
            );
          })}
        </svg>
      </TooltipTrigger>
      <TooltipContent side="bottom">{running ? label : `${label}. Sync now`}</TooltipContent>
    </Tooltip>
  );
}
