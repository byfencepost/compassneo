import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /** Every school we have proven lives at <slug>.compass.education. Grows as people sign in. */
  schools: defineTable({
    slug: v.string(),
    name: v.string(),
    organisationId: v.optional(v.string()),
    region: v.optional(v.string()),
    verifiedAt: v.number(),
    signIns: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_organisation", ["organisationId"])
    .index("by_signIns", ["signIns"])
    .searchIndex("search_name", { searchField: "name" }),

  /** Compass's school search answers, kept for a week so a name is only ever asked about once. */
  directory: defineTable({
    key: v.string(),
    items: v.array(v.object({ organisationId: v.string(), name: v.string() })),
    fetchedAt: v.number(),
  }).index("by_key", ["key"]),

  /** Schools whose address we could not guess, so the next person does not wait on the same failed probes. */
  misses: defineTable({
    organisationId: v.string(),
    checkedAt: v.number(),
  }).index("by_organisation", ["organisationId"]),

  /** One Compass account (a school and a username), shared by every device signed in to it. See accounts.ts. */
  accounts: defineTable({
    key: v.string(),
    slug: v.string(),
    username: v.string(),
    schoolName: v.string(),
    compassUserId: v.number(),
    displayName: v.string(),
    fullName: v.optional(v.string()),
    formGroup: v.optional(v.string()),
    /** The Compass profile photo, copied into Convex storage, and the Compass path it came from (to spot a new one). */
    photoId: v.optional(v.id("_storage")),
    photoPath: v.optional(v.string()),
    sealedLogin: v.optional(v.string()),
    sealedCompass: v.string(),
    compassAt: v.number(),
    sealedConnect: v.optional(v.string()),
    connectAt: v.optional(v.number()),
    connectStudentId: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** A signed-in device: the hash of the token the browser holds, pointing at its account. */
  sessions: defineTable({
    tokenHash: v.string(),
    accountId: v.id("accounts"),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_lastSeen", ["lastSeenAt"])
    .index("by_account", ["accountId"]),

  /** What Connect last said for an account (grades), so the app shows it at once and asks Connect again only now and then. */
  connectCache: defineTable({
    accountId: v.id("accounts"),
    kind: v.string(),
    data: v.optional(v.any()),
    fetchedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    checkedAt: v.number(),
  }).index("by_account_kind", ["accountId", "kind"]),

  /**
   * What Compass last said for an account, trimmed to what the app shows: "tasks", "news", one "day:YYYY-MM-DD" row per
   * school day of the timetable (convex/timetable.ts), and "classes", every class seen on the timetable lately.
   */
  compassCache: defineTable({
    accountId: v.id("accounts"),
    kind: v.string(),
    data: v.any(),
    fetchedAt: v.number(),
  }).index("by_account_kind", ["accountId", "kind"]),

  /**
   * One pass over everything Compass Neo keeps for an account: a step per thing fetched, in order, Compass first and
   * then Connect. The app draws its sync dial from this as it fills in.
   */
  syncs: defineTable({
    accountId: v.id("accounts"),
    reason: v.union(v.literal("sign-in"), v.literal("open"), v.literal("manual")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    steps: v.array(
      v.object({
        key: v.string(),
        source: v.union(v.literal("compass"), v.literal("connect")),
        status: v.union(v.literal("waiting"), v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("skipped")),
        count: v.optional(v.number()),
        note: v.optional(v.string()),
        at: v.optional(v.number()),
      }),
    ),
  }).index("by_account", ["accountId", "startedAt"]),

  /** Teachers per school: the name and photo Compass shows for each (convex/teachers.ts). */
  teachers: defineTable({
    slug: v.string(),
    code: v.string(),
    userId: v.number(),
    name: v.optional(v.string()),
    photoPath: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    checkedAt: v.number(),
  }).index("by_slug_code", ["slug", "code"]),

  /** Sign-in attempts per school and username, to stop this server being used to guess passwords. */
  attempts: defineTable({
    key: v.string(),
    at: v.number(),
  }).index("by_key_at", ["key", "at"]),
});
