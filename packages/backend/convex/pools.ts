import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

/**
 * The workpool (convex.config.ts): work goes in it instead of straight to the scheduler so it is durable (a job that
 * dies is retried with backoff) and throttled (at most maxParallelism at once, the rest wait their turn).
 *
 * Syncs are not in a pool: a pool runs each job as an action inside an action of its own, so every second of a sync
 * was paid for twice, and its loop costs a dozen mutations a job. They are on the scheduler (convex/sync.ts).
 */

/** Reading announcements with Claude (convex/announcements.ts): narrow, for the API's rate limits. */
export const aiPool = new Workpool(components.aiPool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 4, initialBackoffMs: 5_000, base: 2 },
});
