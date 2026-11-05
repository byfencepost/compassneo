import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep attempts and stale sessions", { hours: 1 }, internal.auth.sweep, {});

export default crons;
