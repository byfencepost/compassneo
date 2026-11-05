import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep attempts and stale sessions", { hours: 1 }, internal.auth.sweep, {});

// The background scheduler: each minute, the accounts whose turn in the quarter hour has come (convex/sync.ts).
crons.interval("background syncs", { minutes: 1 }, internal.sync.tick, {});

export default crons;
