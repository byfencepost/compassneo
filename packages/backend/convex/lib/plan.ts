/**
 * A lesson plan, from the HTML fragment a teacher writes in Compass to plain blocks the app draws itself: paragraphs and
 * list items, each a run of text that may be bold, italic or a link. Nothing of the HTML reaches the page, so a plan
 * can carry no script, style or tracking image; links are kept only when they go to http(s).
 */

export type PlanRun = { t: string; b?: true; i?: true; href?: string };
export type PlanBlock = { kind: "p" | "li"; runs: PlanRun[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const BLOCK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "table", "section", "article"]);
const DROP = new Set(["script", "style", "head", "title", "noscript", "iframe", "object", "svg"]);
/** Caps, so one huge plan cannot fill a cache row. */
const MAX_BLOCKS = 200;
const MAX_CHARS = 20000;

export function parsePlan(source: string): PlanBlock[] {
  // Plain text (no tags at all): each line is its own paragraph.
  const html = /<[a-z!/]/i.test(source) ? source : source.replace(/\r?\n/g, "<br>");
  const blocks: PlanBlock[] = [];
  let current: PlanBlock | null = null;
  let bold = 0;
  let italic = 0;
  let href: string | null = null;
  let dropping: string | null = null;
  let chars = 0;

  const end = () => {
    if (current) {
      // Trim the block's ends and drop it when nothing is left.
      const runs = current.runs;
      while (runs.length && !runs[0]!.t.trim()) runs.shift();
      while (runs.length && !runs[runs.length - 1]!.t.trim()) runs.pop();
      if (runs.length) {
        runs[0]!.t = runs[0]!.t.replace(/^\s+/, "");
        runs[runs.length - 1]!.t = runs[runs.length - 1]!.t.replace(/\s+$/, "");
        blocks.push(current);
      }
    }
    current = null;
  };
  const text = (raw: string) => {
    if (dropping || chars >= MAX_CHARS) return;
    const t = decode(raw).replace(/[ \t\r\n\f]+/g, " ");
    if (!t) return;
    chars += t.length;
    current ??= { kind: "p", runs: [] };
    const run: PlanRun = { t };
    if (bold) run.b = true;
    if (italic) run.i = true;
    if (href) run.href = href;
    const last = current.runs[current.runs.length - 1];
    if (last && !!last.b === !!run.b && !!last.i === !!run.i && last.href === run.href) last.t += t;
    else current.runs.push(run);
  };

  for (const m of html.matchAll(/<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g)) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (m[3] !== undefined) {
      text(m[3]);
      continue;
    }
    if (m[0] === "<") {
      text("<");
      continue;
    }
    const tag = m[1]?.toLowerCase();
    if (!tag) continue;
    const closing = m[0][1] === "/";
    if (dropping) {
      if (closing && tag === dropping) dropping = null;
      continue;
    }
    if (DROP.has(tag)) {
      if (!closing && !/\/\s*$/.test(m[2] ?? "")) dropping = tag;
      continue;
    }
    if (tag === "br") {
      // A line break ends the paragraph; a list item keeps going on the next line.
      if (current?.kind === "li") text("\n");
      else end();
    } else if (tag === "li") {
      end();
      if (!closing) current = { kind: "li", runs: [] };
    } else if (BLOCK.has(tag) || tag === "ul" || tag === "ol") end();
    else if (tag === "strong" || tag === "b") bold = Math.max(0, bold + (closing ? -1 : 1));
    else if (tag === "em" || tag === "i") italic = Math.max(0, italic + (closing ? -1 : 1));
    else if (tag === "a") {
      if (closing) href = null;
      else {
        const raw = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2] ?? "");
        const url = decode(raw?.[1] ?? raw?.[2] ?? raw?.[3] ?? "").trim();
        href = /^https?:\/\//i.test(url) ? url : null;
      }
    } else if (tag === "td" || tag === "th") text(" ");
  }
  end();
  return blocks;
}
