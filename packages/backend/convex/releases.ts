import { v } from "convex/values";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";

/**
 * The phone app's installable builds. Android is sideloaded as an APK (no Play Store), so updates come two ways:
 *   JS only        EAS Update, over the air: the app picks it up by itself (apps/mobile/src/lib/updates.ts)
 *   a new native   a new APK: the app asks `latest` here, and a build newer than its own shows the update card, which
 *   build          opens the download (or /android, which always redirects to the newest)
 * A release is published once its build has finished (apps/mobile/scripts/release-android.mjs runs `publish`).
 */

export async function newest(ctx: QueryCtx, platform: "android") {
  return await ctx.db
    .query("releases")
    .withIndex("by_platform_build", i => i.eq("platform", platform))
    .order("desc")
    .first();
}

/** The newest build for a platform, or null before the first is published. Public: it says nothing about anyone. */
export const latest = query({
  args: { platform: v.literal("android") },
  handler: async (ctx, { platform }) => {
    const r = await newest(ctx, platform);
    return r && { build: r.build, version: r.version, url: r.url, notes: r.notes ?? null, at: r.at };
  },
});

/** Records a finished build. Publishing the same build number again replaces it (a fixed URL or note). */
export const publish = internalMutation({
  args: { platform: v.literal("android"), build: v.number(), version: v.string(), url: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const same = await ctx.db
      .query("releases")
      .withIndex("by_platform_build", i => i.eq("platform", args.platform).eq("build", args.build))
      .first();
    if (same) await ctx.db.replace(same._id, { ...args, at: Date.now() });
    else await ctx.db.insert("releases", { ...args, at: Date.now() });
  },
});

/** The newest Android APK's URL, for /android (http.ts). */
export const newestUrl = internalQuery({
  args: {},
  handler: async ctx => (await newest(ctx, "android"))?.url ?? null,
});
