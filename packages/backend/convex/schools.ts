import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  normalizeSlug,
  probeSchool,
  resolveSlug,
  sameSchoolName,
  searchDirectory,
  slugRegion,
  type DirectorySchool,
} from "@compassneo/compass";

const DAY = 24 * 60 * 60 * 1000;
const DIRECTORY_TTL = 7 * DAY;
const MISS_TTL = 3 * DAY;

export type School = { slug: string; name: string; organisationId: string | null };

const pub = (s: Doc<"schools">): School => ({ slug: s.slug, name: s.name, organisationId: s.organisationId ?? null });

// ---------- reads ----------

/** Known schools matching a name or an address. Empty text lists the schools people sign in to most. */
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }): Promise<School[]> => {
    const text = q.trim();
    if (!text) {
      const top = await ctx.db.query("schools").withIndex("by_signIns").order("desc").take(5);
      return top.filter(s => s.signIns > 0).map(pub);
    }
    const out = new Map<string, School>();
    const slug = normalizeSlug(text);
    if (slug) {
      const exact = await ctx.db.query("schools").withIndex("by_slug", i => i.eq("slug", slug)).unique();
      if (exact) out.set(exact.slug, pub(exact));
    }
    if (text.length >= 2) {
      const hits = await ctx.db.query("schools").withSearchIndex("search_name", s => s.search("name", text)).take(8);
      for (const h of hits) if (!out.has(h.slug)) out.set(h.slug, pub(h));
    }
    return [...out.values()];
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug: input }): Promise<School | null> => {
    const slug = normalizeSlug(input);
    if (!slug) return null;
    const s = await ctx.db.query("schools").withIndex("by_slug", i => i.eq("slug", slug)).unique();
    return s ? pub(s) : null;
  },
});

// ---------- Compass's directory ----------

export type DirectoryHit = DirectorySchool & { slug: string | null };

/** Compass's own school search by name, cached for a week and joined with the addresses we already know. */
export const directory = action({
  args: { q: v.string() },
  handler: async (ctx, { q }): Promise<DirectoryHit[]> => {
    const text = q.trim().toLowerCase().replace(/\s+/g, " ");
    if (text.length < 3) return [];
    const key = `AU:${text}`;
    const cached = await ctx.runQuery(internal.schools.cachedDirectory, { key });
    let items: DirectorySchool[] | null = cached && Date.now() - cached.fetchedAt < DIRECTORY_TTL ? cached.items : null;
    if (!items) {
      items = await searchDirectory(text, { region: "AU", take: 10 });
      await ctx.runMutation(internal.schools.saveDirectory, { key, items });
    }
    const known: (string | null)[] = await ctx.runQuery(internal.schools.slugsFor, { organisationIds: items.map(i => i.organisationId), names: items.map(i => i.name) });
    return items.map((i, n) => ({ ...i, slug: known[n] ?? null }));
  },
});

export type Resolution =
  | { status: "found"; school: School }
  | { status: "unknown" }
  | { status: "blocked" };

/** Finds where a directory school lives on Compass: a known address, or guesses checked against its login page. */
export const resolve = action({
  args: { organisationId: v.string(), name: v.string(), region: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Resolution> => {
    const [known] = await ctx.runQuery(internal.schools.slugsFor, { organisationIds: [args.organisationId], names: [args.name] });
    if (known) return { status: "found", school: { slug: known, name: args.name, organisationId: args.organisationId } };
    const missedAt = await ctx.runQuery(internal.schools.missedAt, { organisationId: args.organisationId });
    if (missedAt && Date.now() - missedAt < MISS_TTL) return { status: "unknown" };

    const found = await resolveSlug(args.name, { region: args.region?.toLowerCase() });
    if (found === "blocked") return { status: "blocked" };
    if (!found) {
      await ctx.runMutation(internal.schools.saveMiss, { organisationId: args.organisationId });
      return { status: "unknown" };
    }
    const school = { slug: found.slug, name: found.name, organisationId: args.organisationId };
    await ctx.runMutation(internal.schools.upsert, school);
    return { status: "found", school };
  },
});

export type Verification =
  | { status: "found"; school: School }
  | { status: "missing"; slug: string }
  | { status: "invalid" }
  | { status: "blocked" };

/** Checks an address a person typed or pasted, and remembers the school if it is real. */
export const verify = action({
  args: { slug: v.string() },
  handler: async (ctx, { slug: input }): Promise<Verification> => {
    const slug = normalizeSlug(input);
    if (!slug) return { status: "invalid" };
    const known = await ctx.runQuery(internal.schools.bySlug, { slug });
    if (known && Date.now() - known.verifiedAt < 30 * DAY) return { status: "found", school: pub(known) };

    const p = await probeSchool(slug);
    if (p.kind === "blocked") return { status: "blocked" };
    if (p.kind === "missing") return { status: "missing", slug };

    let organisationId = known?.organisationId ?? null;
    if (!organisationId) {
      try {
        const hits = await searchDirectory(p.name, { take: 10 });
        organisationId = hits.find(h => sameSchoolName(h.name, p.name))?.organisationId ?? null;
      } catch {
        // The directory is a nicety here; the address is already proven.
      }
    }
    const school = { slug, name: p.name, organisationId };
    await ctx.runMutation(internal.schools.upsert, school);
    return { status: "found", school };
  },
});

// ---------- internals ----------

export const cachedDirectory = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) => ctx.db.query("directory").withIndex("by_key", i => i.eq("key", key)).unique(),
});

export const saveDirectory = internalMutation({
  args: { key: v.string(), items: v.array(v.object({ organisationId: v.string(), name: v.string() })) },
  handler: async (ctx, { key, items }) => {
    const row = await ctx.db.query("directory").withIndex("by_key", i => i.eq("key", key)).unique();
    if (row) await ctx.db.patch(row._id, { items, fetchedAt: Date.now() });
    else await ctx.db.insert("directory", { key, items, fetchedAt: Date.now() });
  },
});

/** The known slug for each directory school, by organisation id, then by exact name. */
export const slugsFor = internalQuery({
  args: { organisationIds: v.array(v.string()), names: v.array(v.string()) },
  handler: async (ctx, { organisationIds, names }) => {
    return Promise.all(
      organisationIds.map(async (id, n) => {
        const byOrg = await ctx.db.query("schools").withIndex("by_organisation", i => i.eq("organisationId", id)).first();
        if (byOrg) return byOrg.slug;
        const name = names[n];
        if (!name) return null;
        const hits = await ctx.db.query("schools").withSearchIndex("search_name", s => s.search("name", name)).take(3);
        return hits.find(h => sameSchoolName(h.name, name) && !h.organisationId)?.slug ?? null;
      }),
    );
  },
});

export const bySlug = internalQuery({
  args: { slug: v.string() },
  handler: (ctx, { slug }) => ctx.db.query("schools").withIndex("by_slug", i => i.eq("slug", slug)).unique(),
});

export const missedAt = internalQuery({
  args: { organisationId: v.string() },
  handler: async (ctx, { organisationId }) =>
    (await ctx.db.query("misses").withIndex("by_organisation", i => i.eq("organisationId", organisationId)).unique())?.checkedAt ?? null,
});

export const saveMiss = internalMutation({
  args: { organisationId: v.string() },
  handler: async (ctx, { organisationId }) => {
    const row = await ctx.db.query("misses").withIndex("by_organisation", i => i.eq("organisationId", organisationId)).unique();
    if (row) await ctx.db.patch(row._id, { checkedAt: Date.now() });
    else await ctx.db.insert("misses", { organisationId, checkedAt: Date.now() });
  },
});

export const upsert = internalMutation({
  args: { slug: v.string(), name: v.string(), organisationId: v.union(v.string(), v.null()) },
  handler: async (ctx, { slug, name, organisationId }) => {
    const row = await ctx.db.query("schools").withIndex("by_slug", i => i.eq("slug", slug)).unique();
    const fields = { name, verifiedAt: Date.now(), region: slugRegion(slug) ?? undefined, ...(organisationId ? { organisationId } : {}) };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("schools", { slug, signIns: 0, ...fields });
    if (organisationId) {
      const miss = await ctx.db.query("misses").withIndex("by_organisation", i => i.eq("organisationId", organisationId)).unique();
      if (miss) await ctx.db.delete(miss._id);
    }
  },
});
