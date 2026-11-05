import type { CompassSession } from "./session";
import { getLearningTasks, getTermAttendance } from "./endpoints";

/**
 * Compass beyond the timetable: class resources, learning tasks in full (and handing work in), events, attendance and
 * Chronicle. Endpoints and field names were read from Compass's own page scripts (Organise.Activities.Activity,
 * Records.UserProfileNew.*, Communicate.SchoolResources) and checked against a real student account.
 */

type D<T> = { d: T };

const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const n0 = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() && Number.isFinite(Number(x)) ? Number(x) : 0;
const pct = (x: unknown) => (x == null || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);

// ---------------------------------------------------------------------------------------------------------------
// Class resources: the files, links and pages teachers put on a class (the class page's Resources tab). One call
// answers the whole tree: Wiki.svc/GetActivityAndSubjectResourcesNode, the class's own folder and its subject's.

/** WikiNodeType in Compass's enums. Pages are HTML (lesson plans are pages); learning tasks also live in the tree. */
const NODE_KIND: Record<number, CompassResource["kind"]> = { 1: "folder", 2: "page", 3: "file", 4: "link", 8: "link", 9: "link" };

export type CompassResource = {
  id: number;
  name: string;
  kind: "folder" | "page" | "file" | "link";
  /** A file or page: the asset to download (FileAssets.svc/DownloadFile with the node's id). */
  fileAssetId: string | null;
  filename: string | null;
  /** A link (a web page, a Google Drive or OneDrive file). */
  url: string | null;
  by: string | null;
  /** A folder of lesson plans ("LP: 02/02/2026 - 02:05 PM" pages), which Compass makes for every class. */
  lessonPlans?: true;
  children: CompassResource[];
};

const MAX_RESOURCES = 2500;

function resourceOf(n: Record<string, any>, count: { n: number }): CompassResource | null {
  const kind = NODE_KIND[n.type as number];
  if (!kind || count.n >= MAX_RESOURCES) return null;
  count.n++;
  const c = (n.content ?? {}) as Record<string, any>;
  const name = str(n.name) ?? str(c.filename) ?? "Untitled";
  const children =
    kind === "folder"
      ? ((n.children ?? []) as Array<Record<string, any>>).map(k => resourceOf(k, count)).filter((r): r is CompassResource => !!r)
      : [];
  return {
    id: Number(n.id),
    name,
    kind,
    fileAssetId: str(c.fileAssetId),
    filename: str(c.filename),
    url: str(c.uri) ?? str(c.url),
    by: str(n.createdByUsername),
    ...(kind === "folder" && /^lesson plans?$/i.test(name) ? { lessonPlans: true as const } : {}),
    children,
  };
}

/**
 * A class's resources as a tree. Compass wraps them in an unnamed root and a "Class: 10EN1" folder (and a
 * "Subject: ..." one where the subject has its own); a lone wrapper is unwrapped, so the tree starts at the folders a
 * teacher made.
 */
export async function getClassResources(s: CompassSession, activityId: number): Promise<CompassResource[]> {
  const r = await s.request<D<Record<string, any> | null>>("/Services/Wiki.svc/GetActivityAndSubjectResourcesNode?sessionstate=readonly", "POST", {
    activityId,
  });
  if (!r.d) return [];
  const count = { n: 0 };
  const top = ((r.d.children ?? []) as Array<Record<string, any>>).map(k => resourceOf(k, count)).filter((x): x is CompassResource => !!x);
  const wrappers = top.filter(t => t.kind === "folder" && /^(class|subject):/i.test(t.name));
  if (wrappers.length === 1 && top.length === 1) return wrappers[0]!.children;
  return top.map(t => (wrappers.includes(t) ? { ...t, name: t.name.replace(/^class:\s*/i, "Class ").replace(/^subject:\s*/i, "Subject ") } : t));
}

/** Where a resource (or a learning task's attachment) downloads from: the asset, on the wiki node it sits on. */
export const assetPath = (fileAssetId: string, nodeId?: number | null) =>
  `/Services/FileAssets.svc/DownloadFile?id=${encodeURIComponent(fileAssetId)}${nodeId ? `&nodeId=${nodeId}` : ""}`;

/** A file a student handed in for a learning task (FileDownloadType.LearningTasksSubmissionDownload). */
export const submissionPath = (taskId: number, submissionId: number) =>
  `/Services/FileDownload/FileRequestHandler?FileDownloadType=2&taskId=${taskId}&submissionId=${submissionId}`;

// ---------------------------------------------------------------------------------------------------------------
// Learning tasks in full, and handing work in. Shapes from the learning task window (Records.UserProfileNew.LearningTasks).

/** LearningTasksSubmissionStatus. */
const TASK_STATUS = { 1: "pending", 2: "overdue", 3: "on-time", 4: "late" } as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** LearningTasksSubmissionType: what a slot to hand work in takes. Universal takes a file or a link. */
const SLOT_KIND: Record<number, "file" | "universal" | "turnitin"> = { 1: "file", 2: "universal", 3: "turnitin" };
/** LearningTasksSubmissionFileType: File, ExternalLink, DriveLink, SubmissionUrl, OneDriveLink. */
const SUBMITTED_KIND: Record<number, "file" | "link"> = { 1: "file", 2: "link", 3: "link", 4: "link", 5: "link" };

export type CompassTask = {
  id: number;
  activityId: number | null;
  className: string | null;
  name: string;
  /** The teacher's instructions, an HTML fragment. */
  description: string | null;
  due: string | null;
  createdAt: string | null;
  important: boolean;
  attachments: Array<{ id: string; name: string; fileName: string | null; nodeId: number | null; url: string | null }>;
  /** Where work is handed in; a task with none takes nothing through Compass. */
  slots: Array<{ id: number; name: string; kind: "file" | "universal" | "turnitin" }>;
  /** The student's own line on the task: what they handed in and their status. */
  me: {
    taskStudentId: number;
    status: TaskStatus | null;
    submittedAt: string | null;
    submissions: Array<{ id: number; slotId: number | null; name: string; kind: "file" | "link"; at: string | null; url: string | null }>;
    /** A result the teacher has made visible, as Compass words it. */
    result: string | null;
    canSubmit: boolean;
  } | null;
};

export function taskOf(t: Record<string, any>, userId: number): CompassTask {
  const mine = ((t.students ?? []) as Array<Record<string, any>>).find(x => x.userId === userId) ?? null;
  const security = ((t.securityOptions ?? []) as Array<Record<string, any>>).find(o => o.userBaseRole === 1);
  const primary = (mine?.primaryResult ?? null) as Record<string, any> | null;
  return {
    id: Number(t.id),
    activityId: typeof t.activityId === "number" && t.activityId > 0 ? t.activityId : null,
    className: str(t.activityName),
    name: str(t.name) ?? "Task",
    description: str(t.description),
    due: str(mine?.dueDateTimestamp) ?? str(t.dueDateTimestamp),
    createdAt: str(t.createdTimestamp),
    important: !!t.important,
    attachments: ((t.attachments ?? []) as Array<Record<string, any>>).map(a => ({
      id: String(a.id),
      name: str(a.name) ?? str(a.fileName) ?? "Attachment",
      fileName: str(a.fileName),
      nodeId: typeof a.wikiNodeId === "number" ? a.wikiNodeId : null,
      url: str(a.contentUrl),
    })),
    slots: ((t.submissionItems ?? []) as Array<Record<string, any>>).map(i => ({
      id: Number(i.id),
      name: str(i.name) ?? "Submission",
      kind: SLOT_KIND[i.type as number] ?? "file",
    })),
    me: mine
      ? {
          taskStudentId: Number(mine.id),
          status: TASK_STATUS[mine.submissionStatus as keyof typeof TASK_STATUS] ?? null,
          submittedAt: str(mine.submittedTimestamp) ?? str(mine.lastSubmittedTimestamp),
          submissions: ((mine.submissions ?? []) as Array<Record<string, any>>).map(x => {
            const kind = SUBMITTED_KIND[x.submissionFileType as number] ?? "file";
            const name = str(x.fileName) ?? "Submission";
            return {
              id: Number(x.id),
              slotId: typeof x.taskSubmissionItemId === "number" ? x.taskSubmissionItemId : null,
              name,
              kind,
              at: str(x.timestamp),
              url: kind === "link" ? (str(x.contentUrl) ?? (/^(https?:\/\/|www\.)/i.test(name) ? name : null)) : null,
            };
          }),
          result: (security?.gradingVisible ?? false) && primary ? (str(primary.result) ?? str(primary.resultText) ?? null) : null,
          canSubmit: security ? !!security.allowSubmission : true,
        }
      : null,
  };
}

/** Every learning task the student has, in full (instructions, attachments, slots, what they handed in). */
export async function getTasks(s: CompassSession, { limit = 300 }: { limit?: number } = {}): Promise<CompassTask[]> {
  const userId = await s.resolveUserId();
  return (await getLearningTasks(s, { limit })).map(t => taskOf(t, userId));
}

/** Compass's generic upload (FileUploadType.GenericFileUpload): the file lands in Compass's store as an id to hand in. */
export async function uploadFile(s: CompassSession, file: Blob, name: string): Promise<{ fileId: string; fileName: string }> {
  const form = new FormData();
  form.append("FileUploadType", "7");
  form.append("file", file, name);
  const r = await s.upload<Record<string, any>>("/Services/FileUpload/FileUploadHandler", form);
  const fileId = str(r.fileId) ?? str(r.OutputFileId);
  if (!fileId || r.success === false) throw new Error(str(r.message) ?? str(r.msg) ?? "Compass did not take the file.");
  return { fileId, fileName: str(r.fileName) ?? str(r.file) ?? name };
}

/**
 * Hands work in on a learning task: a file already uploaded (uploadFile), or a link. This writes to Compass, exactly as
 * the student pressing Save in Compass's own learning task window does. Returns the new submission's id.
 */
export async function submitTask(
  s: CompassSession,
  { taskStudentId, slotId, file, url }: { taskStudentId: number; slotId: number; file?: { fileId: string; fileName: string }; url?: string },
): Promise<number> {
  let fileId: string;
  let fileName: string;
  let submissionFileType: number;
  if (file) {
    ({ fileId, fileName } = file);
    submissionFileType = 1;
  } else if (url) {
    const r = await s.request<D<{ success?: boolean; fileId?: string; fileName?: string; message?: string }>>(
      "/Services/FileAssets.svc/UploadSubmissionUrlWithPost?sessionstate=readonly",
      "POST",
      { addressString: url },
    );
    if (!r.d?.success || !r.d.fileId) throw new Error(r.d?.message || "Compass did not take that link.");
    fileId = r.d.fileId;
    fileName = r.d.fileName ?? url;
    submissionFileType = 4;
  } else throw new Error("Nothing to hand in.");
  const r = await s.request<D<number>>("/Services/LearningTasks.svc/CreateTaskStudentSubmission", "POST", {
    taskStudentSubmission: { taskSubmissionItemId: slotId, taskStudentId, submitterBaseRole: 1, fileId, fileName, submissionFileType },
  });
  return Number(r.d);
}

// ---------------------------------------------------------------------------------------------------------------
// Events: excursions, clubs, assemblies, exams. They come from the same calendar as the timetable (ActivityType in
// Compass's enums): everything that is not a class or a learning task's due date.

const EVENT_KIND: Record<number, CompassEvent["kind"]> = { 2: "event", 3: "meeting", 4: "assembly", 5: "activity", 7: "calendar", 11: "exam", 14: "club" };

export type CompassEvent = {
  id: string;
  activityId: number | null;
  kind: "event" | "meeting" | "assembly" | "activity" | "calendar" | "exam" | "club";
  title: string;
  description: string | null;
  /** The session within the event ("After School Sessions"). */
  session: string | null;
  start: string;
  finish: string;
  allDay: boolean;
  place: string | null;
  /** Who runs it, as the end of Compass's long title says ("... - RJOHNSON"). */
  lead: string | null;
  rollMarked: boolean;
};

/** The last part of a long title ("Year 10 River Cruise - Barrack St Jetty - RJOHNSON") when it is a staff code. */
const leadOf = (long: string | null) => {
  const last = long?.split(" - ").pop()?.trim();
  return last && long!.includes(" - ") && /^[A-Z][A-Z'.]+$/.test(last) ? last : null;
};

export async function getEvents(s: CompassSession, from: string, to: string): Promise<CompassEvent[]> {
  const userId = await s.resolveUserId();
  const r = await s.request<D<Array<Record<string, any>>>>(
    "/Services/Calendar.svc/GetCalendarEventsByUser?sessionstate=readonly&ExcludeNonRelevantPd=true",
    "POST",
    { userId, homePage: true, activityId: null, locationId: null, staffIds: null, startDate: from, endDate: to, page: 1, start: 0, limit: 5000 },
  );
  return (r.d ?? [])
    .filter(e => EVENT_KIND[e.activityType as number])
    .map(e => {
      const long = str(e.longTitleWithoutTime);
      const loc = ((e.locations ?? [])[0] ?? {}) as Record<string, any>;
      return {
        id: String(e.instanceId ?? e.guid ?? `${e.activityId}@${e.start}`),
        activityId: typeof e.activityId === "number" && e.activityId > 0 ? e.activityId : null,
        kind: EVENT_KIND[e.activityType as number]!,
        title: str(e.title) ?? "Event",
        description: str(e.description),
        session: str(e.sessionName),
        start: e.start,
        finish: e.finish,
        allDay: !!e.allDay,
        place: str(loc.coveringLocationName) ?? str(loc.locationName) ?? str(e.location),
        lead: leadOf(long),
        rollMarked: !!e.rollMarked,
      };
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Attendance: by class (Attendance.svc/GetAttendanceSummary, the attendance tab's grid) and by term
// (ReferenceData.svc/GetTermAttendanceDays). Field names are Compass's short ones, read in the attendance page script.

export type ClassAttendance = {
  activityId: number;
  code: string;
  name: string;
  /** Rolls marked for the student, and how many found them present or not. */
  marked: number;
  present: number;
  absent: number;
  late: number;
  /** Absences that count against attendance, and the ones that do not (an excursion, an approved activity). */
  counted: number;
  notCounted: number;
  authorised: number;
  unauthorised: number;
  /** Compass's own percentages: present out of marked, and with the absences that do not count left out. */
  percent: number | null;
  percentCounted: number | null;
};

export async function getClassAttendance(s: CompassSession, from: string, to: string): Promise<ClassAttendance[]> {
  const userId = await s.resolveUserId();
  const r = await s.request<D<Array<Record<string, any>>>>("/Services/Attendance.svc/GetAttendanceSummary?sessionstate=readonly", "POST", {
    startDate: from,
    endDate: to,
    studentStatus: "2",
    inClass: ["0", "1"],
    overall: ["0", "1"],
    okClass: ["0", "1"],
    vce: ["0", "1"],
    schl: ["0", "1"],
    perspective: "1",
    totalWholeDayLimit: "0",
    totalPartialDayLimit: "0",
    userId: String(userId),
  });
  return (r.d ?? []).map(x => ({
    activityId: n0(x.aid),
    code: str(x.an) ?? "",
    name: str(x.sn) ?? str(x.an) ?? "Class",
    marked: n0(x.im),
    present: n0(x.p),
    absent: n0(x.tna),
    late: n0(x.l),
    counted: n0(x.counted),
    notCounted: n0(x.notcounted),
    authorised: n0(x.authorizedabsence) + n0(x.npa),
    unauthorised: n0(x.unauthorizedabsence) + n0(x.npu),
    percent: pct(x.pa),
    percentCounted: pct(x.spc),
  }));
}

export type TermAttendance = {
  term: string;
  /** Whole days present, partial days (late or left early), and days absent. */
  wholeDays: number;
  partialDays: number;
  absentDays: number;
  halfDays: number;
  rate: number | null;
};

export async function getTermAttendanceDays(s: CompassSession, year: number): Promise<TermAttendance[]> {
  return (await getTermAttendance(s, year)).map(t => ({
    term: str(t.termName) ?? "Term",
    wholeDays: n0(t.wholePresent),
    partialDays: n0(t.partialPresent),
    absentDays: n0(t.fullDayAbsence),
    halfDays: n0(t.halfDayAbsence),
    rate: pct(t.attendanceRatePercent),
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Chronicle: the notes staff keep on a student (commendations, behaviour, wellbeing), as far as the student may see.

/** ChronicleRating. */
const RATING: Record<number, ChronicleEntry["rating"]> = { 1: "positive", 2: "caution", 3: "concern", 4: "neutral" };

export type ChronicleEntry = {
  id: number;
  title: string;
  category: string | null;
  rating: "positive" | "caution" | "concern" | "neutral";
  points: number;
  at: string | null;
  by: string | null;
  /** The entry's fields the student may see ("Details": "Helped set up the science fair"). */
  fields: Array<{ name: string; value: string }>;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** A field's HTML as one line of text: tags dropped, entities read ("05:45 PM &gt; 09:45 PM" is "05:45 PM > 09:45 PM"). */
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(Number.parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10) || 32) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, " ")
    .trim();

export type ChronicleSummary ={ category: string; count: number; yearCount: number; points: number };

export async function getChronicle(
  s: CompassSession,
  { from, to, max = 60 }: { from: string; to: string; max?: number },
): Promise<{ summary: ChronicleSummary[]; entries: ChronicleEntry[]; total: number }> {
  const userId = await s.resolveUserId();
  const summary = await s.request<D<Array<Record<string, any>>>>("/Services/ChronicleV2.svc/GetSummaryByUserId?sessionstate=readonly", "POST", {
    targetUserId: userId,
  });
  // The feed shows only the categories asked for (Compass's Categories menu, every one ticked by default): an empty list
  // is none at all, not every one. The categories relevant to the student are the menu's.
  const categories = await s.request<D<Array<Record<string, any>>>>("/Services/ChronicleV2.svc/GetRelevantCategories?sessionstate=readonly", "POST", {
    targetUserId: userId,
  });
  const filterCategoryIds = (categories.d ?? []).map(c => c.id).filter((id): id is number => typeof id === "number");
  const feed = await s.request<D<{ data?: Array<Record<string, any>>; total?: number }>>(
    "/Services/ChronicleV2.svc/GetUserChronicleFeedThin?sessionstate=readonly",
    "POST",
    { targetUserId: userId, start: 0, pageSize: max, startDate: from, endDate: to, filterCategoryIds, asParent: false },
  );
  const entries: ChronicleEntry[] = [];
  for (const group of feed.d?.data ?? []) {
    for (const e of (group.chronicleEntries ?? []) as Array<Record<string, any>>) {
      entries.push({
        id: n0(e.id),
        title: plain(str(e.templateName) ?? "") || "Chronicle entry",
        category: str(e.categoryName),
        rating: RATING[e.rating as number] ?? "neutral",
        points: n0(e.points),
        at: str(e.occurredTimestamp) ?? str(e.createdTimestamp),
        by: str(e.userNameCreated) ?? str(e.creatorName),
        fields: ((e.inputFields ?? []) as Array<Record<string, any>>)
          .filter(f => f.showInFeedStudents !== false && str(f.value))
          .map(f => ({ name: plain(str(f.name) ?? ""), value: plain(str(f.value) ?? "") }))
          .filter(f => f.value),
      });
    }
  }
  return {
    summary: (summary.d ?? []).map(c => ({ category: str(c.categoryName) ?? "Other", count: n0(c.totalCount), yearCount: n0(c.yearCount), points: n0(c.totalPoints) })),
    entries,
    total: n0(feed.d?.total),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Every roll, one by one (Attendance.svc/GetFullRecord, the attendance tab's full record): each class or event the
// student was on a roll for, when, which period, and what the roll said ("Present", "Late: Unexplained",
// "Not Present: Explained (Sick)"). Newest first, paged; read back to `since`.

export type Roll = {
  /** The lesson (instance) id. */
  id: string;
  start: string;
  finish: string;
  activityId: number | null;
  /** "10MA1"; and Compass's whole name for it, "10MA1 (Year 10 Mathematics)". */
  code: string;
  name: string;
  /** Compass's period number, or null for an event. */
  period: number | null;
  /** What the roll says, in Compass's words. */
  status: string;
  isClass: boolean;
};

export async function getRolls(s: CompassSession, since: string, { pageSize = 500, maxPages = 6 } = {}): Promise<Roll[]> {
  const userId = await s.resolveUserId();
  const out: Roll[] = [];
  for (let page = 0; page < maxPages; page++) {
    const r = await s.request<D<{ data?: Array<Record<string, any>>; total?: number }>>("/Services/Attendance.svc/GetFullRecord?sessionstate=readonly", "POST", {
      userId,
      page: page + 1,
      start: page * pageSize,
      limit: pageSize,
      sort: JSON.stringify([{ property: "s", direction: "DESC" }]),
    });
    const rows = r.d?.data ?? [];
    for (const x of rows) {
      const start = str(x.s);
      if (!start || start < since) return out;
      const name = str(x.n) ?? "";
      out.push({
        id: String(x.id ?? `${x.aid}@${start}`),
        start,
        finish: str(x.f) ?? start,
        activityId: typeof x.aid === "number" ? x.aid : null,
        code: name.split(" (")[0]!.trim() || name,
        name,
        period: x.p != null && /^\d+$/.test(String(x.p)) ? Number(x.p) : null,
        status: str(x.st) ?? "Not Marked",
        isClass: x.activityType === 1,
      });
    }
    if (rows.length < pageSize) break;
  }
  return out;
}
