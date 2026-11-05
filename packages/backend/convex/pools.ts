import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

/**
 * The workpools (convex.config.ts). Work goes in a pool instead of straight to the scheduler so it is durable (a job
 * that dies is retried with backoff) and throttled (at most maxParallelism at once, the rest wait their turn), and so
 * one kind of work never starves another: a background sweep cannot hold up the sync someone is watching.
 *
 * Tune maxParallelism here as the user count grows; Compass and Connect see at most this many sessions at once from us.
 */

/** Syncs someone is waiting on: a sign-in, opening the app, "Sync now", an open tab's minute sync. */
export const syncPool = new Workpool(components.syncPool, {
  maxParallelism: 20,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 2_000, base: 2 },
});

/** The quarter-hourly background syncs. Narrower than syncPool: nobody is watching, so they can wait. */
export const backgroundPool = new Workpool(components.backgroundPool, {
  maxParallelism: 8,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 10_000, base: 2 },
});

/** The pool a sync's job goes in, by why it was asked for (convex/sync.ts): background runs wait in their own. */
export const poolFor = (reason: string) => (reason === "background" ? backgroundPool : syncPool);

/** Reading announcements with Claude (convex/announcements.ts): narrow, for the API's rate limits. */
export const aiPool = new Workpool(components.aiPool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 5_000, base: 2 },
});
