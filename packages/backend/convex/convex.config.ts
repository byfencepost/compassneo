import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config";

/**
 * Components. One workpool (convex/pools.ts):
 *   aiPool  reading announcements with Claude (convex/announcements.ts), kept narrow for the API's rate limits
 * Syncs had pools of their own once; they are on the scheduler now (convex/sync.ts says why).
 */
const app = defineApp();
app.use(workpool, { name: "aiPool" });

export default app;
