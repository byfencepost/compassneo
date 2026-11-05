import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";

/**
 * Components. Three workpools keep the kinds of work from crowding each other out (convex/pools.ts):
 *   syncPool        syncs someone is waiting on: a sign-in, opening the app, "Sync now", an open tab's minute sync
 *   backgroundPool  the quarter-hourly background syncs, spread over the quarter by the scheduler (convex/sync.ts)
 *   aiPool          reading announcements with Claude (convex/announcements.ts), kept narrow for the API's rate limits
 */
const app = defineApp();
app.use(workpool, { name: "syncPool" });
app.use(workpool, { name: "backgroundPool" });
app.use(workpool, { name: "aiPool" });

export default app;
