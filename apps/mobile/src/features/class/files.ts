import { dayName } from "@/lib/days";
import type { ClassResources, ResourceNode, ResourceSide, Source } from "./data";
import type { GlyphName } from "./glyph";

/**
 * The class's library, ported from the web (apps/web/app/features/class/files.tsx and kit.tsx): Compass's Resources,
 * Connect's Learning Content and the Canvas course's modules as one collection of folders, what is new across them,
 * and Compass's folder of lesson plans (every class has one, mostly empty pages) set aside. Pure, so the tab only draws.
 */

type Node = ResourceNode;
export type Leaf = { node: Node; trail: Node[] };
export type Plan = { node: Node; label: string };

// ---------- kinds of file ----------

/** What a thing is: its glyph, a class hue to wear (null is a neutral grey), and its name. */
export type Kind = { glyph: GlyphName; hue: number | null; label: string };

const KINDS = {
  word: { glyph: "word", hue: 8, label: "Word document" },
  pdf: { glyph: "pdf", hue: 0, label: "PDF" },
  slides: { glyph: "slides", hue: 1, label: "Slides" },
  sheet: { glyph: "sheet", hue: 4, label: "Spreadsheet" },
  image: { glyph: "image", hue: 11, label: "Image" },
  video: { glyph: "video", hue: 10, label: "Video" },
  audio: { glyph: "audio", hue: 5, label: "Audio" },
  archive: { glyph: "archive", hue: null, label: "Zip" },
  code: { glyph: "code", hue: 6, label: "Code" },
  text: { glyph: "plan", hue: null, label: "Text" },
  file: { glyph: "file", hue: null, label: "File" },
  link: { glyph: "link", hue: 7, label: "Link" },
  videoLink: { glyph: "play", hue: 0, label: "Video" },
  page: { glyph: "page", hue: 5, label: "Page" },
  task: { glyph: "task", hue: null, label: "Submission" },
  talk: { glyph: "talk", hue: null, label: "Discussion" },
} satisfies Record<string, Kind>;

const EXT = new Map<string, Kind>();
for (const [kind, exts] of [
  ["word", "doc docx docm dot dotx odt rtf pages"],
  ["pdf", "pdf"],
  ["slides", "ppt pptx pptm pps ppsx odp key"],
  ["sheet", "xls xlsx xlsm csv ods numbers"],
  ["image", "png jpg jpeg gif webp heic bmp svg tif tiff"],
  ["video", "mp4 mov avi mkv webm m4v wmv"],
  ["audio", "mp3 wav m4a aac ogg flac"],
  ["archive", "zip rar 7z tar gz"],
  ["code", "html htm css js ts py java c cpp cs json xml ipynb sb3 gd php sql"],
  ["text", "txt md"],
] as const) {
  for (const ext of exts.split(" ")) EXT.set(ext, KINDS[kind]);
}

const extOf = (name: string | null | undefined) => /\.([a-z0-9]{1,5})$/i.exec(name ?? "")?.[1]?.toLowerCase() ?? null;

/** What a file is, from its name, or its mime type when the name says nothing. */
export function fileKind(name: string | null | undefined, mime?: string | null): Kind {
  const byExt = EXT.get(extOf(name) ?? "");
  if (byExt) return byExt;
  if (mime?.startsWith("image/")) return KINDS.image;
  if (mime?.startsWith("video/")) return KINDS.video;
  if (mime?.startsWith("audio/")) return KINDS.audio;
  if (mime === "application/pdf") return KINDS.pdf;
  if (mime?.startsWith("text/")) return KINDS.text;
  return KINDS.file;
}

export function hostOf(url: string | null | undefined) {
  if (!url) return null;
  return /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(url)?.[1]?.toLowerCase() ?? null;
}

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|loom\.com|vimeo\.com|clickview\.com\.au|clickview\.net|edpuzzle\.com)$/i;

/** A link: a video (YouTube, Loom ...) or anything else. */
export function linkKind(url: string | null | undefined): Kind {
  const host = hostOf(url);
  return host && VIDEO_HOSTS.test(host) ? KINDS.videoLink : KINDS.link;
}

/** A work file (an attachment, something handed in): a link's kind, or a file's. */
export const workFileKind = (f: { name: string; href: string | null; external: boolean }) => (f.external ? linkKind(f.href) : fileKind(f.name));

export function kindOfNode(n: Node): Kind {
  if (n.kind === "link") return linkKind(n.href);
  if (n.kind === "page") return KINDS.page;
  if (n.kind === "submission") return KINDS.task;
  if (n.kind === "discussion") return KINDS.talk;
  return fileKind(n.fileName ?? n.name, n.mime);
}

/** "72 KB", "1.1 MB". */
export function sizeText(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`;
}

/** A name without its extension, when the extension only says what the glyph already does ("Probability.docx"). */
function bareName(name: string) {
  const ext = extOf(name);
  return ext && EXT.has(ext) && name.length > ext.length + 1 ? name.slice(0, -(ext.length + 1)) : name;
}

/** A thing's name as a row shows it: a file without its extension, a pasted address without its scheme. */
export const titleOf = (n: Node) =>
  n.kind === "file" ? bareName(n.name) : n.kind === "link" && /^https?:\/\//i.test(n.name) ? n.name.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : n.name;

/** A YouTube video's id, for its thumbnail; null for a playlist or anything else. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const ok = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null);
  const m = /^https?:\/\/(?:www\.|m\.|music\.)?(youtu\.be|youtube\.com|youtube-nocookie\.com)(\/[^?#]*)?(\?[^#]*)?/i.exec(url);
  if (!m) return null;
  const path = m[2] ?? "";
  if (m[1]!.toLowerCase() === "youtu.be") return ok(path.slice(1).split("/")[0]);
  if (path === "/watch") return ok(/[?&]v=([^&]+)/.exec(m[3] ?? "")?.[1]);
  return ok(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(path)?.[1]);
}

// ---------- the library ----------

export type Library = {
  /** Folders in order (loose files sit in a folder of their own), without the lesson plans and empty folders. */
  roots: Node[];
  /** Every page in the lesson plans folder, newest first, named by its lesson. */
  plans: Plan[];
  leaves: Leaf[];
  /** Each folder's count of things, at any depth, by its key. */
  counts: Map<string, number>;
  /** More than one side has something, so each folder says where it came from. */
  mixed: boolean;
  /** The newest things with a date, newest first. */
  fresh: Leaf[];
};

const MONTH = 30 * 86400000;
const FRESH_MAX = 6;
const isFolder = (n: Node) => n.kind === "folder";

const folderOf = (key: string, name: string, source: Source, children: Node[]): Node => ({
  key,
  name,
  kind: "folder",
  source,
  href: null,
  external: false,
  fileName: null,
  mime: null,
  size: null,
  by: null,
  at: null,
  page: null,
  children,
});

/** "LP: 11/02/2026 - 08:50 AM", as Compass names a lesson plan: its day and time, if the name has them. */
const LP_NAME = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i;

function planOf(node: Node, today: string): Plan & { sort: string } {
  const m = LP_NAME.exec(node.name);
  if (!m) return { node, label: node.name, sort: "" };
  const day = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  if (!m[4]) return { node, label: dayName(day, today), sort: day };
  let h = Number(m[4]);
  const half = m[6]?.toLowerCase();
  if (half === "pm" && h < 12) h += 12;
  if (half === "am" && h === 12) h = 0;
  const time = `${Number(m[4])}:${m[5]}${half ? ` ${half}` : ""}`;
  return { node, label: `${dayName(day, today)} · ${time}`, sort: `${day}T${String(h).padStart(2, "0")}:${m[5]}` };
}

export function buildLibrary(res: ClassResources | null | undefined, today: string, now: number): Library {
  const plans: Node[] = [];
  const takePages = (n: Node) => {
    if (n.kind === "page") plans.push(n);
    n.children.forEach(takePages);
  };
  // Lesson plans go to their own list; folders with nothing in them go.
  const strip = (nodes: Node[]): Node[] =>
    nodes.flatMap(n => {
      if (n.lessonPlans) {
        takePages(n);
        return [];
      }
      if (!isFolder(n)) return [n];
      const children = strip(n.children);
      return children.length ? [{ ...n, children }] : [];
    });
  const side = (s: ResourceSide | undefined, source: Source): Node[] => {
    if (s?.status !== "ready") return [];
    const nodes = strip(s.data);
    const loose = nodes.filter(n => !isFolder(n));
    const folders = nodes.filter(isFolder);
    return loose.length ? [folderOf(`${source}:loose`, "Loose files", source, loose), ...folders] : folders;
  };

  const counts = new Map<string, number>();
  const leaves: Leaf[] = [];
  const walk = (n: Node, trail: Node[]): number => {
    if (!isFolder(n)) {
      leaves.push({ node: n, trail });
      return 1;
    }
    const count = n.children.reduce((a, c) => a + walk(c, [...trail, n]), 0);
    counts.set(n.key, count);
    return count;
  };
  // The bigger library leads; each keeps its teacher's order.
  const libraries = [side(res?.compass, "compass"), side(res?.connect, "connect"), side(res?.canvas, "canvas")]
    .map(nodes => ({ nodes, count: nodes.reduce((a, n) => a + walk(n, []), 0) }))
    .sort((a, b) => b.count - a.count);

  return {
    roots: libraries.flatMap(l => l.nodes),
    plans: plans
      .map(p => planOf(p, today))
      .sort((a, b) => b.sort.localeCompare(a.sort))
      .map(({ node, label }) => ({ node, label })),
    leaves,
    counts,
    mixed: libraries.filter(l => l.count > 0).length > 1,
    fresh: leaves
      .filter(l => l.node.at && l.node.kind !== "page" && now - Date.parse(l.node.at) < MONTH)
      .sort((a, b) => Date.parse(b.node.at!) - Date.parse(a.node.at!))
      .slice(0, FRESH_MAX),
  };
}

/** Every word of the search in the thing's name, its file's name or its folders' names. */
export function searchLibrary(lib: Library, q: string): Leaf[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (text: string) => {
    const t = text.toLowerCase();
    return words.every(w => t.includes(w));
  };
  const leaves = lib.leaves.filter(l => hit([l.node.name, l.node.fileName ?? "", ...l.trail.map(f => f.name)].join(" ")));
  const plans = lib.plans.filter(p => hit(`${p.label} ${p.node.name} lesson plans`));
  return [...leaves, ...plans.map(p => ({ node: { ...p.node, name: p.label }, trail: [folderOf("@plans", "Lesson plans", "compass", [])] }))];
}

/** A folder's things in groups: its own first, then each folder inside it (at any depth) under its path. */
export function groupsOf(node: Node) {
  const out: { key: string; path: string[]; leaves: Leaf[] }[] = [];
  const walk = (n: Node, trail: Node[]) => {
    const leaves = n.children.filter(c => !isFolder(c));
    if (leaves.length) out.push({ key: n.key, path: trail.slice(1).map(f => f.name), leaves: leaves.map(c => ({ node: c, trail })) });
    for (const f of n.children.filter(isFolder)) walk(f, [...trail, f]);
  };
  walk(node, [node]);
  return out;
}

/** Canvas's own things, which open on Canvas: what they are, in place of the school's Canvas address. */
const ON_CANVAS: Partial<Record<Node["kind"], string>> = { page: "Canvas page", submission: "Canvas assignment", discussion: "Canvas discussion" };

/** A row's quiet line: a link's site; else where it is (in New and a search) or what it is (in its folder). */
export function lineOf(l: Leaf, how: "where" | "what") {
  const n = l.node;
  if (n.kind === "link") return hostOf(n.href) ?? "Link";
  const canvas = n.source === "canvas" ? ON_CANVAS[n.kind] : undefined;
  if (canvas) return how === "where" && l.trail.length ? `${canvas} · ${l.trail[l.trail.length - 1]!.name}` : canvas;
  const folder = l.trail[l.trail.length - 1];
  if (how === "where" && folder) return folder.name;
  return [kindOfNode(n).label, sizeText(n.size)].filter(Boolean).join(" · ");
}

/** Things shown together come from more than one side, so each shows where it came from. */
export const mixedSources = (leaves: Leaf[]) => new Set(leaves.map(l => l.node.source)).size > 1;

/** The class's resources are in and there is nothing in them (while they load, there may well be). */
export function noResources(res: ClassResources | null | undefined) {
  if (!res) return false;
  const hasLeaf = (n: Node): boolean => n.kind !== "folder" || n.children.some(hasLeaf);
  const sides = [res.compass, res.connect, res.canvas];
  if (sides.some(s => s.status === "missing" || s.status === "unavailable")) return false;
  return !sides.some(s => s.status === "ready" && s.data.some(hasLeaf));
}
