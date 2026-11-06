import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { api } from "@compassneo/backend/api";
import { signOutNotice } from "@/lib/notice";
import { isRunning, useSyncState, type SyncState } from "@/lib/sync";
import { ago, useNow } from "@/lib/time";
import { GlassIconButton } from "@/components/ui/glass";
import { useTheme } from "@/theme/theme";

/** The gauge's span, as on the login's dial. */
const SWEEP = 150;
/** The fewest bearings the arc draws, whatever the run's step count. */
const MIN_TICKS = 8;
/** How wide the glyph is drawn; its height follows the 32 by 18 drawing. */
const GLYPH = 22;
/** The kit's glass circle it sits in when it stands on its own over content, the photo's own 40pt. */
const ROUND = 40;
/** The bare square in a navigation bar (home's, a pushed page's), whose glass platter iOS 26 draws around it. */
const BARE = 36;

/**
 * The web's `neo-tick-running` (apps/web/app/features/timetable/timetable.css): each bearing still to come breathes from
 * dim to lit and back over 900ms, on Glaze's house curve, each one 90ms behind the last so the light runs along the arc.
 */
const PERIOD = 900;
const STAGGER = 90;
const DIM = 0.35;
const PEAK_AT = 0.4;
const houseCurve = Easing.bezierFn(0.2, 0.8, 0.2, 1);

const Tick = Animated.createAnimatedComponent(Line);

/** What the gauge says, as the web's does: syncing only for a run someone is watching, else the last sync. */
export function syncLabel(state: SyncState | null | undefined, now: number) {
  if (isRunning(state?.watched)) return "Syncing";
  const last = state?.last;
  if (!last?.finishedAt) return "Not synced yet";
  const partly = last.steps.some(s => s.status === "failed");
  return `${partly ? "Partly synced" : "Synced"} ${ago(last.finishedAt, now)}`;
}

/**
 * The sync, as the web draws it (apps/web/app/features/sync/sync-button.tsx): the login's gauge in miniature and nothing
 * else, an arc of bearings, one per step of the sync. Synced, they are all lit in Neo blue (amber where a part of the
 * last sync failed). While a sync someone is watching runs (a sign-in, opening the app, a pull, a press here), the
 * steps done are lit and the rest pulse in turn along the arc, so it reads as working without saying what. The quiet
 * syncs (the app's minute, the background's quarter hour) leave it at rest. Pressing it syncs now, with a tap; its
 * name says when it last did.
 *
 * In a navigation bar (home's, grades', to do's) pass `glass={false}`: iOS 26 already sets a glass platter behind a
 * bar's own items, and glass on glass reads as two. With `glass` (the default) it is a round Liquid Glass button of its
 * own (the kit's, which ticks and squashes on its own), for over content. Only the arc's lines ever pulse (their
 * stroke's opacity): nothing around the glass fades.
 */
export function SyncGauge({ token, glass = true }: { token: string; glass?: boolean }) {
  const c = useTheme();
  const state = useSyncState(token);
  const syncNow = useMutation(api.sync.now);
  const now = useNow(30_000);
  // Pressed and not yet answered: the arc starts working at once rather than when the server's run shows up.
  const [asked, setAsked] = useState(false);
  const live = isRunning(state?.watched);
  const running = live || asked;
  const label = running ? "Syncing" : syncLabel(state, now);
  // The run the arc draws: the watched one while it runs, else the last to finish (all still to come, while asked).
  const run = live ? state?.watched : state?.last;
  const steps = live || !asked ? (run?.steps ?? []) : (run?.steps ?? []).map(s => ({ ...s, status: "waiting" as const }));
  const n = Math.max(steps.length, MIN_TICKS);

  const again = () => {
    setAsked(true);
    void syncNow({ token, force: true })
      .then(r => {
        if (!r.ok && (r.code === "signed-out" || r.code === "password-changed")) signOutNotice.set(r.message);
      })
      .catch(() => {})
      .finally(() => setAsked(false));
  };

  const ticks = Array.from({ length: n }, (_, i) => {
    const s = steps[i];
    const lit = s ? s.status === "done" || s.status === "skipped" || (!running && s.status !== "failed") : !running && !!run?.finishedAt;
    const failed = s?.status === "failed";
    const pulsing = running && !lit && !failed;
    const color = failed ? c.warn : lit ? c.neo : running ? c.neoText : c.text3;
    return { i, color, pulsing };
  });
  const { clock, still } = useBreath(ticks.some(t => t.pulsing));

  const arc = (
    <Svg width={GLYPH} height={(GLYPH * 18) / 32} viewBox="0 0 32 18" fill="none">
      {ticks.map(t => (
        <Bearing key={t.i} i={t.i} n={n} color={t.color} breathe={t.pulsing && !still} clock={clock} />
      ))}
    </Svg>
  );

  if (glass)
    return (
      // The symbol is never drawn (the arc is), but the kit's button asks for one.
      <GlassIconButton
        ios="arrow.triangle.2.circlepath"
        android="sync"
        size={ROUND}
        label={label}
        hint={running ? undefined : "Syncs now"}
        busy={running}
        onPress={running ? undefined : again}
      >
        {arc}
      </GlassIconButton>
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={running ? undefined : "Syncs now"}
      accessibilityState={{ busy: running }}
      onPress={
        running
          ? undefined
          : () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              again();
            }
      }
      hitSlop={4}
      // Dimming under the finger is safe here: this sits inside the header's glass, never around any.
      style={({ pressed }) => ({ width: BARE, height: BARE, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.55 : 1 })}
    >
      {arc}
    </Pressable>
  );
}

/**
 * One clock for every bearing that pulses, looping 0 to PERIOD while any does, so they stay in step with one another.
 * It stands still for anyone who has asked their phone for less motion (the web drops the animation then too).
 */
function useBreath(on: boolean) {
  const still = useReducedMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (on && !still) {
      clock.set(0);
      clock.set(withRepeat(withTiming(PERIOD, { duration: PERIOD, easing: Easing.linear }), -1, false));
    } else {
      cancelAnimation(clock);
      clock.set(0);
    }
    return () => cancelAnimation(clock);
  }, [on, still, clock]);
  return { clock, still };
}

/**
 * One bearing of n on the arc, out from the dial's centre just under the drawing. One still to come breathes on the UI
 * thread, on the shared clock, its place along the arc setting how far behind the first it runs.
 */
function Bearing({ i, n, color, breathe, clock }: { i: number; n: number; color: string; breathe: boolean; clock: SharedValue<number> }) {
  const deg = -SWEEP / 2 + (SWEEP * (i + 0.5)) / n;
  const a = ((deg - 90) * Math.PI) / 180;
  const delay = i * STAGGER;
  const props = useAnimatedProps(() => {
    if (!breathe) return { strokeOpacity: 1 };
    const phase = ((((clock.get() - delay) % PERIOD) + PERIOD) % PERIOD) / PERIOD;
    // 0% and 100% dim, 40% lit, each leg on the house curve, as the CSS keyframes run.
    const o = phase < PEAK_AT ? DIM + (1 - DIM) * houseCurve(phase / PEAK_AT) : 1 - (1 - DIM) * houseCurve((phase - PEAK_AT) / (1 - PEAK_AT));
    return { strokeOpacity: o };
  });
  return (
    <Tick
      x1={(16 + 9 * Math.cos(a)).toFixed(2)}
      y1={(17 + 9 * Math.sin(a)).toFixed(2)}
      x2={(16 + 15 * Math.cos(a)).toFixed(2)}
      y2={(17 + 15 * Math.sin(a)).toFixed(2)}
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      animatedProps={props}
    />
  );
}
