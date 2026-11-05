import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Accounts: one per school and username, shared by every device signed in to it.
 *
 * An account holds, sealed (lib/crypto.ts):
 *   sealedLogin    the username and password (CREDENTIALS_KEY), so Compass Neo can sign in again when Compass or
 *                  Connect ends the session. Compass does that every day.
 *   sealedCompass  Compass's session cookies (SESSION_KEY)
 *   sealedConnect  Connect's session cookies (SESSION_KEY), WA schools only
 * Each is bound to the account's key, so it opens only on its own row.
 *
 * Sessions are devices: a token hash pointing at an account. When the last device signs out, the account and its
 * stored login are deleted.
 */

export const accountKey = (slug: string, username: string) => `${slug}:${username.trim().toLowerCase()}`;

const HOUR = 60 * 60 * 1000;

export const byTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db.query("sessions").withIndex("by_token", i => i.eq("tokenHash", tokenHash)).first();
    if (!session) return null;
    const account = await ctx.db.get(session.accountId);
    return account ? { session, account } : null;
  },
});

export const byId = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: (ctx, { accountId }) => ctx.db.get(accountId),
});

/** A successful sign-in: the account is created or refreshed with the new login and cookies, and a device added. */
export const signedIn = internalMutation({
  args: {
    tokenHash: v.string(),
    key: v.string(),
    slug: v.string(),
    username: v.string(),
    schoolName: v.string(),
    compassUserId: v.number(),
    displayName: v.string(),
    fullName: v.optional(v.string()),
    formGroup: v.optional(v.string()),
    sealedLogin: v.string(),
    sealedCompass: v.string(),
  },
  handler: async (ctx, { tokenHash, ...fields }): Promise<Id<"accounts">> => {
    const now = Date.now();
    const existing = await ctx.db.query("accounts").withIndex("by_key", i => i.eq("key", fields.key)).unique();
    const accountId = existing
      ? (await ctx.db.patch(existing._id, { ...fields, compassAt: now, updatedAt: now }), existing._id)
      : await ctx.db.insert("accounts", { ...fields, compassAt: now, createdAt: now, updatedAt: now });
    await ctx.db.insert("sessions", { tokenHash, accountId, createdAt: now, lastSeenAt: now });
    const school = await ctx.db.query("schools").withIndex("by_slug", i => i.eq("slug", fields.slug)).unique();
    if (school) await ctx.db.patch(school._id, { signIns: school.signIns + 1 });
    return accountId;
  },
});

export const saveCompass = internalMutation({
  args: { accountId: v.id("accounts"), sealedCompass: v.string(), fresh: v.boolean() },
  handler: async (ctx, { accountId, sealedCompass, fresh }) => {
    if (!(await ctx.db.get(accountId))) return;
    await ctx.db.patch(accountId, { sealedCompass, ...(fresh ? { compassAt: Date.now() } : {}), updatedAt: Date.now() });
  },
});

export const saveProfile = internalMutation({
  args: {
    accountId: v.id("accounts"),
    displayName: v.string(),
    fullName: v.optional(v.string()),
    formGroup: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    photoPath: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, ...profile }) => {
    const account = await ctx.db.get(accountId);
    if (!account) {
      // Signed out while the photo was copied: it has nobody to belong to.
      if (profile.photoId) await ctx.storage.delete(profile.photoId);
      return;
    }
    if (profile.photoId && account.photoId && account.photoId !== profile.photoId) await ctx.storage.delete(account.photoId);
    await ctx.db.patch(accountId, { ...profile, updatedAt: Date.now() });
  },
});

export const saveConnect = internalMutation({
  args: { accountId: v.id("accounts"), sealedConnect: v.string(), connectStudentId: v.optional(v.number()), fresh: v.boolean() },
  handler: async (ctx, { accountId, sealedConnect, connectStudentId, fresh }) => {
    if (!(await ctx.db.get(accountId))) return;
    await ctx.db.patch(accountId, {
      sealedConnect,
      ...(connectStudentId != null ? { connectStudentId } : {}),
      ...(fresh ? { connectAt: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Marks a device as used, at most once an hour, so idle devices can be swept. */
export const touch = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const s = await ctx.db.get(sessionId);
    if (s && Date.now() - s.lastSeenAt > HOUR) await ctx.db.patch(sessionId, { lastSeenAt: Date.now() });
  },
});

/** Deletes an account, its devices and everything cached for it: its stored login goes with it. */
export async function forgetAccount(ctx: MutationCtx, account: Doc<"accounts">) {
  for (const s of await ctx.db.query("sessions").withIndex("by_account", i => i.eq("accountId", account._id)).collect()) {
    await ctx.db.delete(s._id);
  }
  for (const c of await ctx.db.query("connectCache").withIndex("by_account_kind", i => i.eq("accountId", account._id)).collect()) {
    await ctx.db.delete(c._id);
  }
  for (const c of await ctx.db.query("compassCache").withIndex("by_account_kind", i => i.eq("accountId", account._id)).collect()) {
    await ctx.db.delete(c._id);
  }
  for (const r of await ctx.db.query("syncs").withIndex("by_account", i => i.eq("accountId", account._id)).collect()) {
    await ctx.db.delete(r._id);
  }
  if (account.photoId) await ctx.storage.delete(account.photoId);
  await ctx.db.delete(account._id);
}

/** The stored login stopped working (the password changed) or there is none to sign in again with. */
export const forget = internalMutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (account) await forgetAccount(ctx, account);
  },
});
