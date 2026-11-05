import type { CompassSession } from "./session";

/**
 * Read-only Compass calls, ported from compass-education 2.3.1 (MIT, heheleo) and the extras.js that shipped with
 * it. Same endpoints and bodies; they go through CompassSession.request instead of a Puppeteer page.
 * Compass wraps every answer in { d }.
 */

type D<T> = { d: T };

const day = (d: Date | string) => (typeof d === "string" ? d : d.toISOString().slice(0, 10));

export type UserDetails = {
  userId: number;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayCode: string | null;
  email: string | null;
  formGroup: string | null;
  house: string | null;
  yearLevel: string | null;
  photoPath: string | null;
};

export async function getUserDetails(s: CompassSession): Promise<UserDetails> {
  return getPersonDetails(s, await s.resolveUserId());
}

/** Someone else's profile, such as a teacher's (their id from a calendar event's teacherId). Schools may refuse it. */
export async function getPersonDetails(s: CompassSession, userId: number): Promise<UserDetails> {
  const r = await s.request<D<Record<string, unknown>>>("/Services/User.svc/GetUserDetailsBlobByUserId", "POST", { targetUserId: userId });
  const e = r.d ?? {};
  const str = (k: string) => (typeof e[k] === "string" && (e[k] as string).trim() ? (e[k] as string).trim() : null);
  return {
    userId,
    fullName: str("userFullName"),
    firstName: str("userFirstName"),
    lastName: str("userLastName"),
    preferredName: str("userPreferredName"),
    displayCode: str("userDisplayCode"),
    email: str("userEmail"),
    formGroup: str("userFormGroup"),
    house: str("userHouse"),
    yearLevel: e.userYearLevelId != null ? String(e.userYearLevelId) : null,
    photoPath: str("userPhotoPath"),
  };
}

export type CalendarEvent = {
  activityId: number | null;
  instanceId: string | null;
  activityType: number | null;
  title: string;
  longTitle: string | null;
  subjectLongName: string | null;
  start: string;
  finish: string;
  allDay: boolean;
  period: number | null;
  rollMarked: boolean;
  room: string | null;
  coveringRoom: string | null;
  teacher: string | null;
  coveringTeacher: string | null;
  /** The teacher's and the relief's Compass user ids, where the calendar gives them (opens their profile and photo). */
  teacherId: number | null;
  coveringTeacherId: number | null;
  /** What the calendar says about the teacher, by field name: for finding where a school keeps photos. */
  teacherFields: string[];
};

const idOf = (x: unknown) => (typeof x === "number" && x > 0 ? x : typeof x === "string" && /^\d+$/.test(x) ? Number(x) : null);

export async function getCalendarEvents(
  s: CompassSession,
  { startDate = new Date(), endDate = new Date(), limit = 50 }: { startDate?: Date | string; endDate?: Date | string; limit?: number } = {},
): Promise<CalendarEvent[]> {
  const userId = await s.resolveUserId();
  const r = await s.request<D<Array<Record<string, any>>>>(
    "/Services/Calendar.svc/GetCalendarEventsByUser?sessionstate=readonly&ExcludeNonRelevantPd=true",
    "POST",
    { userId, homePage: true, activityId: null, locationId: null, staffIds: null, startDate: day(startDate), endDate: day(endDate), page: 1, start: 0, limit },
  );
  return (r.d ?? []).map(e => {
    const m = (e.managers ?? [])[0] ?? {};
    const l = (e.locations ?? [])[0] ?? {};
    return {
      activityId: e.activityId ?? null,
      instanceId: e.instanceId ?? null,
      activityType: e.activityType ?? null,
      title: e.title ?? "",
      longTitle: e.longTitle ?? null,
      subjectLongName: e.subjectLongName ?? null,
      start: e.start,
      finish: e.finish,
      allDay: !!e.allDay,
      period: e.period ? parseInt(e.period, 10) : null,
      rollMarked: !!e.rollMarked,
      room: l.locationName ?? null,
      coveringRoom: l.coveringLocationName ?? null,
      teacher: m.managerImportIdentifier ?? null,
      coveringTeacher: m.coveringImportIdentifier ?? null,
      teacherId: idOf(m.managerIid ?? m.managerUserId ?? m.managerId),
      coveringTeacherId: idOf(m.coveringIid ?? m.coveringUserId ?? m.coveringId),
      teacherFields: Object.keys(m),
    };
  });
}

/**
 * One lesson's own page (the lesson view in Compass's web app): who takes it and who covers it, with the path of each
 * one's photo. A student can read this for their own lessons even where their teachers' profiles are refused
 * (GetUserDetailsBlobByUserId answers 500 to a student), so it is where teachers' photos come from.
 */
export type LessonPeople = {
  managerId: number | null;
  managerName: string | null;
  managerPhotoPath: string | null;
  coveringId: number | null;
  coveringPhotoPath: string | null;
};

export async function getLessonPeople(s: CompassSession, instanceId: string): Promise<LessonPeople> {
  const r = await s.request<D<Record<string, unknown>>>("/Services/Activity.svc/GetLessonsByInstanceIdQuick?sessionstate=readonly", "POST", { instanceId });
  const e = r.d ?? {};
  const str = (k: string) => (typeof e[k] === "string" && (e[k] as string).trim() ? (e[k] as string).trim() : null);
  const id = (k: string) => (typeof e[k] === "number" && (e[k] as number) > 0 ? (e[k] as number) : null);
  return {
    managerId: id("ActivityManagerId"),
    managerName: str("ManagerTextReadable"),
    managerPhotoPath: str("ManagerPhotoPath"),
    coveringId: id("CoveringUid"),
    coveringPhotoPath: str("CoveringPhotoPath"),
  };
}

export async function getLearningTasks(s: CompassSession, { limit = 500 }: { limit?: number } = {}) {
  const userId = await s.resolveUserId();
  const r = await s.request<D<{ data: Array<Record<string, any>> }>>(
    "/Services/LearningTasks.svc/GetAllLearningTasksByUserId?sessionstate=readonly",
    "POST",
    { academicGroupId: null, userId, showHiddenTasks: true, page: 1, start: 0, limit, sort: '[{"property":"dueDateTimestamp","direction":"DESC"}]' },
  );
  return r.d?.data ?? [];
}

export async function getFeedItems(s: CompassSession, { count = 25, savedOnly = false }: { count?: number; savedOnly?: boolean } = {}) {
  const r = await s.request<D<Array<Record<string, any>>>>("/Services/Feed.svc/GetFeedItems", "POST", {
    count,
    sortBy: 1,
    filterOptions: { isSavedOnly: savedOnly, tags: [] },
  });
  return r.d ?? [];
}

export async function getTerms(s: CompassSession) {
  const r = await s.request<D<Array<Record<string, any>>>>("/Services/ReferenceDataCache.svc/GetAllTerms?page=1&start=0&limit=100", "GET");
  return (r.d ?? []).map(t => ({ id: t.id ?? null, name: t.n ?? null, year: Number.parseInt(t.cy, 10) || null, start: t.s ?? null, finish: t.f ?? null }));
}

export async function getTermAttendance(s: CompassSession, year = new Date().getFullYear()) {
  const userId = await s.resolveUserId();
  const r = await s.request<D<Array<Record<string, any>>>>("/Services/ReferenceData.svc/GetTermAttendanceDays?sessionstate=readonly", "POST", {
    userId,
    year,
    includeYearSummaryRow: true,
    page: 1,
    start: 0,
    limit: 25,
  });
  return r.d ?? [];
}

export async function getChronicleSummary(s: CompassSession) {
  const userId = await s.resolveUserId();
  const r = await s.request<D<Array<Record<string, any>>>>("/Services/ChronicleV2.svc/GetSummaryByUserId?sessionstate=readonly", "POST", {
    targetUserId: userId,
  });
  return r.d ?? [];
}

/** A file Compass serves from its asset store. Needs the session's cookies to download. */
export function fileUrl(s: CompassSession, id: string | number | null | undefined, name = "file") {
  return id ? `${s.origin}/Services/FileAssets.svc/DownloadFile?id=${id}&originalFileName=${encodeURIComponent(name)}` : null;
}

/**
 * A lesson's plan, as its teacher wrote it in Compass: an HTML fragment (paragraphs, bold, lists, links) or plain text.
 * The lesson page (GetLessonsByInstanceIdQuick) names it under lp.fileAssetId with the wiki node it sits on (lp.wnid);
 * a lesson without a plan has a null fileAssetId. Null when there is none, or the file is missing.
 */
export async function getLessonPlan(s: CompassSession, instanceId: string): Promise<string | null> {
  const r = await s.request<D<{ lp?: { fileAssetId?: string | null; wnid?: number | null } | null }>>(
    "/Services/Activity.svc/GetLessonsByInstanceIdQuick?sessionstate=readonly",
    "POST",
    { instanceId },
  );
  const lp = r.d?.lp;
  if (!lp?.fileAssetId) return null;
  const node = lp.wnid ? `&nodeId=${lp.wnid}` : "";
  const f = await s.file(`/Services/FileAssets.svc/DownloadFile?id=${encodeURIComponent(lp.fileAssetId)}${node}`);
  if (!f) return null;
  const text = new TextDecoder().decode(f.bytes).trim();
  return text || null;
}
