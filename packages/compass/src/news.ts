import type { CompassSession } from "./session";
import { getFeedItems } from "./endpoints";

/**
 * The school's news feed, with each item's words. Compass's web home page reads it from
 * NewsFeed.svc/GetMyNewsFeedPaged (an ExtJS page of { data, total }, each item's HTML in Content1 and Content2); the
 * phone apps' Feed.svc/GetFeedItems, which the sync used first, gives titles and little else.
 *
 * Neither shape has been checked against a real account, so this reads both defensively: the paged feed first, the
 * other when it fails or comes back empty, every field looked up under any of the names it has been seen with, in any
 * case. The field names an answer actually had come back with it (fields), so a real sync can say where a school keeps
 * them.
 */

type D<T> = { d: T };

export type NewsItem = {
  id: string;
  title: string;
  /** The item's words as plain text: paragraphs and list items on lines of their own, links written out. */
  text: string;
  /**
   * The item's words as Compass has them (its HTML, both halves), capped, for showing the notice as it was written.
   * Never put on a page as it is: the server turns it into plain blocks first (convex/lib/plan.ts).
   */
  html: string;
  by: string | null;
  /** When it was posted, as an ISO instant. */
  at: string | null;
  /** Marked important (Compass's Priority). */
  important: boolean;
  /** The files attached to it, each with where to get it. Their contents are not read here. */
  attachments: NewsAttachment[];
};

/**
 * A file attached to a news item. path: where Compass serves it to the signed-in student (fetched with the session,
 * never anywhere but the school's own Compass); url: a link somewhere else instead. Both null when the item named a
 * file without saying where it is.
 */
export type NewsAttachment = { name: string; path: string | null; url: string | null };

export type NewsFeed = {
  /** Which call answered: the web's paged news feed, or the phone apps' feed. */
  source: "newsfeed" | "feed";
  items: NewsItem[];
  /** The field names the answer's items had, and which of them held an item's words. */
  fields: string[];
  textFields: string[];
  /** Why the paged news feed was not used, when it was not. */
  problem: string | null;
};

/** At most this much text per item: a term's newsletter pasted in whole is still one item. */
const MAX_TEXT = 20_000;
/** And this much of its HTML, which carries its markup besides. */
const MAX_HTML = 80_000;

const PAGED = "/Services/NewsFeed.svc/GetMyNewsFeedPaged?sessionstate=readonly";

/**
 * The feed the student sees, newest first. paged: false goes straight to Feed.svc (a caller that has seen the paged
 * feed fail lately need not ask it every minute).
 */
export async function getNews(s: CompassSession, { limit = 30, paged = true }: { limit?: number; paged?: boolean } = {}): Promise<NewsFeed> {
  let problem: string | null = paged ? null : "NewsFeed.svc not asked: it failed lately";
  // Any failure here, even one that reads as an ended session, falls through to the other feed: a guessed endpoint
  // that Compass answers with its login page must not cost the rest of the sync. A session that really has ended
  // fails the other call too, and that error goes up as usual.
  if (paged) {
    try {
      const r = await s.request<D<unknown>>(PAGED, "POST", { start: 0, limit });
      const rows = rowsOf(r.d);
      if (rows?.length) return read("newsfeed", rows, limit, null);
      problem = rows ? "NewsFeed.svc had no items" : "NewsFeed.svc gave no list";
    } catch (e) {
      problem = `NewsFeed.svc: ${e instanceof Error ? e.message.replace(/ for \/Services\/\S+/, "") : "failed"}`;
    }
  }
  const rows = (await getFeedItems(s, { count: limit })) as unknown[];
  return read("feed", rows, limit, problem);
}

function read(source: NewsFeed["source"], rows: unknown[], limit: number, problem: string | null): NewsFeed {
  const objects = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  // The attachments' own field names too ("Attachments.AssetId"), so a real sync says where a school keeps its files.
  const attachmentKeys = objects.slice(0, 8).flatMap(o => {
    const files = field(o, ATTACHMENTS);
    return Array.isArray(files?.value)
      ? files.value.flatMap(f => (f && typeof f === "object" ? Object.keys(f).map(k => `${files.key}.${k}`) : []))
      : [];
  });
  const fields = [...new Set([...objects.slice(0, 8).flatMap(o => Object.keys(o)), ...attachmentKeys])].sort();
  const textFields = new Set<string>();
  const items = objects.slice(0, limit).map(o => itemOf(o, textFields));
  return { source, items, fields, textFields: [...textFields].sort(), problem };
}

/** The list in an answer: { data: [...] } (an ExtJS page), or the array itself. */
function rowsOf(d: unknown): unknown[] | null {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["data", "Data", "items", "Items", "newsItems", "NewsItems"]) {
      const v = (d as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

// ---------- one item ----------

/** A field by any of its names, whatever its case. */
function field(o: Record<string, unknown>, names: string[]): { key: string; value: unknown } | null {
  const lower = new Map(Object.keys(o).map(k => [k.toLowerCase(), k]));
  for (const n of names) {
    const key = lower.get(n.toLowerCase());
    if (key == null) continue;
    const value = o[key];
    if (value == null || value === "") continue;
    return { key, value };
  }
  return null;
}

const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : typeof x === "number" && Number.isFinite(x) ? String(x) : null);

const ID = ["NewsItemId", "newsItemId", "Id", "itemId", "guid", "Guid", "newsId"];
const TITLE = ["Title", "Subject", "Name", "Heading", "Headline"];
/** Where an item's words have been seen: the news feed splits them over Content1 and Content2. */
const CONTENT = ["Content1", "Content2"];
const OTHER_CONTENT = ["Content", "ContentHtml", "Body", "BodyHtml", "Html", "Description", "Text", "Message", "Details", "Summary", "Preview"];
const BY = ["UserName", "UserFullName", "AuthorName", "Author", "PostedBy", "PostedByName", "CreatedByName", "CreatorName", "ManagerName", "From"];
const AT = ["PostDateTime", "PostDate", "PostedDateTime", "PublishDate", "PublishedDate", "ShowFrom", "Start", "StartDate", "CreatedTimestamp", "CreatedDate", "Created", "Date", "Timestamp"];
const IMPORTANT = ["Priority", "IsPriority", "Important", "IsImportant", "Urgent"];
const ATTACHMENTS = ["Attachments", "Files", "FileAssets"];
const FILE_NAME = ["OriginalFileName", "FileName", "Name", "Title"];
/** The file's asset in Compass's store (FileAssets.svc/DownloadFile?id=), before any id the attachment row has itself. */
const FILE_ASSET = ["AssetId", "FileAssetId", "AssetID", "AssetGuid", "FileId", "Id"];
const FILE_URL = ["UiLink", "DownloadUrl", "Url", "Link", "Href"];

/**
 * Where an attachment is. A link Compass gives on its own site is kept as a path (so the session goes only to Compass:
 * an absolute URL elsewhere, or a protocol-relative "//host", is never fetched with it, only linked to); else the
 * asset id makes the same download Compass's own news page uses.
 */
function attachmentOf(a: unknown): NewsAttachment | null {
  if (!a || typeof a !== "object") {
    const name = str(a);
    return name ? { name, path: null, url: null } : null;
  }
  const o = a as Record<string, unknown>;
  const name = plainLine(str(field(o, FILE_NAME)?.value) ?? "") || "Attachment";
  const link = str(field(o, FILE_URL)?.value);
  if (link) {
    if (/^\/(?!\/)/.test(link)) return { name, path: link, url: null };
    try {
      const u = new URL(link);
      if (/(^|\.)compass\.education$/i.test(u.hostname)) return { name, path: `${u.pathname}${u.search}`, url: null };
      if (u.protocol === "https:" || u.protocol === "http:") return { name, path: null, url: u.toString() };
    } catch {
      // Not a URL: the asset id may still say where it is.
    }
  }
  const asset = str(field(o, FILE_ASSET)?.value);
  if (asset) return { name, path: `/Services/FileAssets.svc/DownloadFile?id=${encodeURIComponent(asset)}&originalFileName=${encodeURIComponent(name)}`, url: null };
  return { name, path: null, url: null };
}

function itemOf(o: Record<string, unknown>, textFields: Set<string>): NewsItem {
  const title = plainLine(str(field(o, TITLE)?.value) ?? "") || "Notice";
  const at = instantOf(field(o, AT)?.value);

  // The news feed's two halves of an item, both kept (the second is often the "read more"); else any one field that
  // holds the words.
  const parts: string[] = [];
  const htmls: string[] = [];
  for (const k of CONTENT) {
    const f = field(o, [k]);
    const v = str(f?.value);
    if (!f || !v) continue;
    textFields.add(f.key);
    const t = htmlToText(v);
    if (t && !parts.includes(t)) {
      parts.push(t);
      htmls.push(v);
    }
  }
  if (!parts.length) {
    const f = field(o, OTHER_CONTENT);
    const v = str(f?.value);
    if (f && v) {
      textFields.add(f.key);
      const t = htmlToText(v);
      if (t) {
        parts.push(t);
        htmls.push(v);
      }
    }
  }
  const text = parts.join("\n\n").slice(0, MAX_TEXT);
  // The halves as blocks of their own, so the second never runs on from the first.
  const html = htmls.map(h => `<div>${h}</div>`).join("").slice(0, MAX_HTML);

  const flag = field(o, IMPORTANT)?.value;
  const files = field(o, ATTACHMENTS)?.value;
  return {
    id: str(field(o, ID)?.value) ?? `${title}@${at ?? ""}`,
    title,
    text: text === title ? "" : text,
    html: text === title ? "" : html,
    by: plainLine(str(field(o, BY)?.value) ?? "") || null,
    at,
    important: flag === true || (typeof flag === "number" && flag > 0) || flag === "true" || flag === "High",
    attachments: Array.isArray(files)
      ? files
          .map(attachmentOf)
          .filter((x): x is NewsAttachment => !!x)
          .slice(0, 10)
      : [],
  };
}

/**
 * An instant as ISO: an ISO string, WCF's "/Date(1762300800000+0800)/", or milliseconds. A time with no zone is read as
 * UTC, which is how Compass's JSON services write them.
 */
function instantOf(x: unknown): string | null {
  if (typeof x === "number" && x > 1e11) return new Date(x).toISOString();
  if (typeof x !== "string") return null;
  const wcf = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//.exec(x);
  if (wcf) return new Date(Number(wcf[1])).toISOString();
  const t = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(x) || !/T\d/.test(x) ? x : `${x}Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// ---------- HTML to text ----------

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©", reg: "®", deg: "°", frac12: "½", times: "×",
};

const decode = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const hex = e[1] === "x" || e[1] === "X";
    const n = Number.parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  });

/** One line of text from a field that may hold a little HTML (a title, a name). */
const plainLine = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();


/** Blocks that end a paragraph (a blank line after them), and blocks that only end a line. */
const PARAGRAPHS = "p|h[1-6]|ul|ol|table|blockquote|pre|dl|figure";
const LINES = "div|thead|tbody|tfoot|tr|section|article|header|footer|dt|dd|center|figcaption|caption";
const CLOSE_PARAGRAPH = new RegExp(`</(?:${PARAGRAPHS})>`, "gi");
const ANY_BLOCK = new RegExp(`</?(?:${PARAGRAPHS}|${LINES})\\b[^>]*>`, "gi");

/**
 * HTML as readable plain text: each paragraph and heading with a blank line after it, list items as "• " lines, table
 * rows as lines with their cells split by " | ", a link's address after its words when they differ, and never more
 * than one blank line in a row.
 */
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return tidy(html);
  const s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title|xml)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href: string, inner: string) => {
      const words = plainLine(inner);
      const url = decode(href).trim();
      const web = /^https?:\/\//i.test(url);
      if (!web || !words) return words || (web ? url : "");
      return words.includes(url) || url.includes(words.replace(/^https?:\/\//i, "")) ? words : `${words} (${url})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(CLOSE_PARAGRAPH, "\n\n")
    .replace(ANY_BLOCK, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return tidy(decode(s));
}

type LineKind = "li" | "row" | "p" | null;
const kindOf = (l: string | undefined): LineKind => (!l ? null : l.startsWith("• ") ? "li" : l.includes(" | ") ? "row" : "p");

/**
 * Spaces squeezed within each line, table rows' stray bars dropped, at most one blank line in a row, and none inside a
 * list or a table (a blank between two "• " lines, or between two rows of cells).
 */
function tidy(s: string) {
  const lines = s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(l =>
      l
        .replace(/[\t    ]+/g, " ")
        .replace(/(?:\s*\|\s*)+$/, "")
        .replace(/^\s*\|\s*/, "")
        .trim(),
    );
  const out: string[] = [];
  // A list item that wraps its words in a paragraph comes out as a bare bullet, then the words: they are one line. An
  // empty item is a bare bullet then a blank, and goes.
  let bullet = false;
  for (const l of lines) {
    if (l === "•") {
      bullet = true;
      continue;
    }
    if (!l) {
      bullet = false;
      if (out.length && out[out.length - 1]) out.push("");
      continue;
    }
    out.push(bullet ? `• ${l}` : l);
    bullet = false;
  }
  return out
    .filter((l, i) => {
      if (l) return true;
      const before = kindOf(out[i - 1]);
      return !(before && before !== "p" && before === kindOf(out[i + 1]));
    })
    .join("\n")
    .trim();
}
