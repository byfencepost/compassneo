import { useEffect } from "react";

/**
 * When this device last asked the server to fetch something (a class's resources, its work, its learners, the
 * attendance), so re-renders and re-mounts never ask twice in a row. The server keeps its own freshness too; this only
 * saves the round trip.
 */
const asked = new Map<string, number>();

/** Runs load once per key per `every` ms while the component is mounted with that key. */
export function useLoadOnce(key: string | null, load: () => Promise<unknown>, every = 60_000) {
  useEffect(() => {
    if (!key) return;
    const now = Date.now();
    if (now - (asked.get(key) ?? 0) < every) return;
    asked.set(key, now);
    void load().catch(() => {});
    // load changes identity every render; the key says when to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, every]);
}

/** Forgets that a key was asked for, so the next mount asks again (after handing work in, say). */
export const forgetLoad = (key: string) => asked.delete(key);
