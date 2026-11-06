import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep attempts and stale sessions", { hours: 1 }, internal.auth.sweep, {});

// The background scheduler: each minute, the accounts whose turn in the quarter hour has come (convex/sync.ts).
crons.interval("background syncs", { minutes: 1 }, internal.sync.tick, {});

// The morning brief: an hour before each student's first class, today's relief teachers and room changes, pushed to
// the phones that want them (convex/brief.ts). Does nothing while it is morning at no school.
crons.interval("morning briefs", { minutes: 5 }, internal.brief.tick, {});

export default crons;
