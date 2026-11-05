import { v } from "convex/values";
import { internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { CompassError, getLessonPeople, type CompassSession } from "@compassneo/compass";
import { addDays, schoolToday } from "./lib/days";
import type { StoredLesson } from "./timetable";

/**
 * Teachers, per school: the photo Compass shows for each teacher on a student's timetable (and the name, where a
 * lookup gives one), so a class card can show who takes it. Kept per school (every student there sees the same
 * teachers) and looked up once a fortnight.
 *
 * Compass's calendar names a lesson's teacher by import code ("sahmed"). A student may not open a teacher's profile
 * (GetUserDetailsBlobByUserId answers 500), but may open their own lessons, and a lesson's page carries its teacher's
 * photo and its relief's (getLessonPeople, the call Compass's own lesson view makes). So each teacher is looked up
 * through one lesson of theirs, and the photo is copied into storage as Compass's square thumbnail.
 */

const CHECK_EVERY_DAYS = 14;
/** Teachers looked up per sync, so one sync never spends long on photos. */
const PER_SYNC = 20;

export const key = (code: string) => code.trim().toLowerCase().replace(/\d+$/, "");

/** A lesson id that is Compass's own instance id (not the stand-in kept when the calendar gave none). */
const isInstance = (id: string) => !!id && !id.includes("@");

type Seen = { userId: number | null; instanceId: string | null; role: "manager" | "covering" };

/** The teachers on the account's timetable around today, by code, each with a lesson of theirs to look them up by. */
export const onTimetable = internalQuery({
  args: { accountId: v.id("accounts"), slug: v.string() },
  handler: async (ctx, { accountId, slug }) => {
    const today = schoolToday(slug);
    const rows = await ctx.db
      .query("compassCache")
      .withIndex("by_account_kind", i =>
        i.eq("accountId", accountId).gte("kind", `day:${addDays(today, -7)}`).lte("kind", `day:${addDays(today, 14)}`),
      )
      .collect();
    const found = new Map<string, Seen>();
    const note = (code: string, userId: number | null | undefined, instanceId: string, role: Seen["role"]) => {
      const k = key(code);
      const was = found.get(k);
      // A lesson they teach beats one they cover; a real instance id beats none.
      const better = !was || (!was.instanceId && isInstance(instanceId)) || (was.role === "covering" && role === "manager" && isInstance(instanceId));
      found.set(k, better ? { userId: userId ?? was?.userId ?? null, instanceId: isInstance(instanceId) ? instanceId : (was?.instanceId ?? null), role: isInstance(instanceId) ? role : (was?.role ?? role) } : { ...was!, userId: was!.userId ?? userId ?? null });
    };
    for (const r of rows) {
      for (const l of (r.data ?? []) as StoredLesson[]) {
        if (!l.isClass) continue;
        if (l.teacher) note(l.teacher, l.teacherId, l.id, "manager");
        if (l.cover) note(l.cover, l.coverId, l.id, "covering");
      }
    }
    // Only the ones not looked up lately, and only those with a lesson to look them up by.
    const due: Array<{ code: string; userId: number | null; instanceId: string; role: Seen["role"] }> = [];
    let withoutLesson = 0;
    const stale = Date.now() - CHECK_EVERY_DAYS * 24 * 60 * 60 * 1000;
    for (const [code, t] of found) {
      if (!t.instanceId) {
        withoutLesson++;
        continue;
      }
      const row = await ctx.db.query("teachers").withIndex("by_slug_code", i => i.eq("slug", slug).eq("code", code)).unique();
      if (!row || row.checkedAt < stale || (t.userId != null && row.userId !== t.userId)) due.push({ code, userId: t.userId, instanceId: t.instanceId, role: t.role });
    }
    return { due: due.slice(0, PER_SYNC), total: found.size, withoutLesson };
  },
});

/** Compass's square thumbnail of a photo (the path a lesson gives is the full-size one). */
const squareOf = (path: string) => path.replace("/cdn/full/", "/cdn/square/");

/**
 * The sync's "people" step: looks up the teachers on the timetable that are due, copies each photo into storage, and
 * says how it went. Never throws: a refusal leaves initials, and the steps around it carry on.
 */
export async function syncTeachers(ctx: ActionCtx, account: Doc<"accounts">, s: CompassSession) {
  const { due, total, withoutLesson } = await ctx.runQuery(internal.teachers.onTimetable, { accountId: account._id, slug: account.slug });
  if (total > 0 && withoutLesson === total) return { count: 0, note: "The calendar gave no lesson ids to look teachers up by." };
  let photos = 0;
  let none = 0;
  let refused = 0;
  let why: string | null = null;
  for (const t of due) {
    try {
      const p = await getLessonPeople(s, t.instanceId);
      const path = t.role === "manager" ? p.managerPhotoPath : p.coveringPhotoPath;
      const image = path ? ((await s.image(squareOf(path)).catch(() => null)) ?? (await s.image(path).catch(() => null))) : null;
      const photoId = image ? await ctx.storage.store(new Blob([image.bytes], { type: image.type })) : undefined;
      if (photoId) photos++;
      else none++;
      await ctx.runMutation(internal.teachers.save, {
        slug: account.slug,
        code: t.code,
        userId: t.userId ?? (t.role === "manager" ? p.managerId : p.coveringId) ?? 0,
        photoPath: path ?? undefined,
        photoId,
      });
    } catch (e) {
      refused++;
      why ??= e instanceof Error ? e.message : String(e);
      // Mark it looked at, so a teacher Compass will not show is not asked about every sync.
      await ctx.runMutation(internal.teachers.save, { slug: account.slug, code: t.code, userId: t.userId ?? 0 });
      // A refusal that looks like an ended session stops here; the next step signs in again if it really has.
      if (e instanceof CompassError && e.code === "expired") break;
    }
  }
  return {
    count: photos,
    note: `${photos} photo${photos === 1 ? "" : "s"}, ${due.length} looked up${none ? `, ${none} without a photo` : ""}${refused ? `, ${refused} refused (${why})` : ""}`,
  };
}

export const save = internalMutation({
  args: {
    slug: v.string(),
    code: v.string(),
    userId: v.number(),
    name: v.optional(v.string()),
    photoPath: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { slug, code, userId, name, photoPath, photoId }) => {
    const row = await ctx.db.query("teachers").withIndex("by_slug_code", i => i.eq("slug", slug).eq("code", code)).unique();
    const now = Date.now();
    if (!row) {
      await ctx.db.insert("teachers", { slug, code, userId, name, photoPath, photoId, checkedAt: now });
      return;
    }
    // A new photo replaces the old one; a lookup that found none keeps what was there.
    if (photoId && row.photoId && row.photoId !== photoId) await ctx.storage.delete(row.photoId);
    await ctx.db.patch(row._id, {
      userId,
      checkedAt: now,
      ...(name ? { name } : {}),
      ...(photoId ? { photoId, photoPath } : {}),
    });
  },
});

/** Forgets a school's teachers, so the next sync looks them all up again. */
export const reset = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const rows = await ctx.db.query("teachers").withIndex("by_slug_code", i => i.eq("slug", slug)).collect();
    for (const r of rows) {
      if (r.photoId) await ctx.storage.delete(r.photoId);
      await ctx.db.delete(r._id);
    }
    return rows.length;
  },
});

/** The teachers a day's lessons name, with their photo addresses, for the day query. */
export async function teachersFor(ctx: QueryCtx, slug: string, codes: Iterable<string | null>) {
  const out = new Map<string, { name: string | null; photoUrl: string | null }>();
  for (const c of codes) {
    if (!c || out.has(key(c))) continue;
    const row = await ctx.db.query("teachers").withIndex("by_slug_code", i => i.eq("slug", slug).eq("code", key(c))).unique();
    out.set(key(c), { name: row?.name ?? null, photoUrl: row?.photoId ? await ctx.storage.getUrl(row.photoId) : null });
  }
  return out;
}
