/**
 * A Compass school lives at https://<slug>.compass.education. Everything here is about getting from what a person
 * types or picks to that slug, and proving the slug belongs to the school they meant.
 */

export const COMPASS_DOMAIN = "compass.education";

/** A desktop Chrome user agent. Compass sits behind Cloudflare, which is kinder to browser-shaped requests. */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Turns anything a person might paste into a slug: "thornlieshs-wa", "thornlieshs-wa.compass.education",
 * "https://thornlieshs-wa.compass.education/Records/User.aspx". Returns null when it is not one.
 */
export function normalizeSlug(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/^www\./, "");
  s = s.replace(/\.compass\.education\.?$/, "");
  if (s.includes(".")) return null;
  return SLUG.test(s) ? s : null;
}

/** True when the text reads as an address rather than a school name: no spaces, and a dash or the domain. */
export function looksLikeSlug(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t || /\s/.test(t)) return false;
  return t.includes(COMPASS_DOMAIN) || t.includes("-") || t.includes("://");
}

export const schoolHost = (slug: string) => `${slug}.${COMPASS_DOMAIN}`;
export const schoolOrigin = (slug: string) => `https://${schoolHost(slug)}`;

/** The region a slug ends in, such as "wa" for thornlieshs-wa. Most Australian schools carry their state. */
export function slugRegion(slug: string): string | null {
  const m = /-([a-z]{2,3})$/.exec(slug);
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// The school directory: Compass's own school search. Names and organisation ids only; the address lookup behind it
// needs a Turnstile token bound to Compass's site, so the slug has to be found another way (guessSlugs + probeSchool).

export type DirectorySchool = { organisationId: string; name: string };

export const DIRECTORY_ORIGIN = "https://schools.compass.education";

export async function searchDirectory(
  name: string,
  { region = "AU", take = 10, signal }: { region?: string; take?: number; signal?: AbortSignal } = {},
): Promise<DirectorySchool[]> {
  const q = name.trim();
  if (q.length < 3) return [];
  const res = await fetch(`${DIRECTORY_ORIGIN}/api/v1/schoolsearch/search?viewingContext=compass`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ name: q, regionCode: region, take, includeTestPortals: false, onlyReal: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Compass school search answered ${res.status}`);
  const body = (await res.json()) as { items?: Array<{ organisationId?: string; name?: string }> };
  return (body.items ?? [])
    .filter((i): i is DirectorySchool => typeof i.organisationId === "string" && typeof i.name === "string")
    .map(i => ({ organisationId: i.organisationId, name: i.name.trim() }));
}

// ---------------------------------------------------------------------------------------------------------------
// Probing: a real school's login page answers 200 and names the school in <h1 class="schoolName">. An unknown
// subdomain redirects away (302) or meets a Cloudflare challenge (403).

export type Probe =
  | { kind: "found"; slug: string; name: string }
  | { kind: "missing"; slug: string }
  | { kind: "blocked"; slug: string; status: number };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** The school's name from its login page HTML, or null. */
export function schoolNameFromLoginPage(html: string): string | null {
  const m = /class="schoolName"[^>]*>([^<]+)</.exec(html);
  const name = m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
  return name || null;
}

export async function probeSchool(slugInput: string, { signal }: { signal?: AbortSignal } = {}): Promise<Probe> {
  const slug = normalizeSlug(slugInput);
  if (!slug) return { kind: "missing", slug: slugInput };
  let res: Response;
  try {
    res = await fetch(`${schoolOrigin(slug)}/login.aspx?sessionstate=disabled`, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "manual",
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    // DNS failure and the like: there is no school there.
    return { kind: "missing", slug };
  }
  if (res.status === 200) {
    const name = schoolNameFromLoginPage(await res.text());
    return name ? { kind: "found", slug, name } : { kind: "missing", slug };
  }
  // Drain the body so the connection can be reused.
  await res.body?.cancel().catch(() => {});
  if (res.status === 403 && res.headers.get("cf-mitigated")) return { kind: "blocked", slug, status: 403 };
  return { kind: "missing", slug };
}

/** Names compare without case, punctuation or extra spaces, so "St Mary's College" matches "St Marys College". */
export function sameSchoolName(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return n(a) === n(b);
}

// ---------------------------------------------------------------------------------------------------------------
// Guessing: most slugs are the school's name with its type shortened, then a dash and the state:
// "Thornlie Senior High School" -> thornlieshs-wa, "McKinnon Secondary College" -> mckinnonsc-vic.

export const AU_REGIONS = ["vic", "wa", "sa", "nsw", "qld", "nt", "tas", "act"] as const;

const TIMEZONE_REGION: Record<string, string> = {
  "Australia/Melbourne": "vic",
  "Australia/Perth": "wa",
  "Australia/Adelaide": "sa",
  "Australia/Broken_Hill": "nsw",
  "Australia/Sydney": "nsw",
  "Australia/Brisbane": "qld",
  "Australia/Lindeman": "qld",
  "Australia/Darwin": "nt",
  "Australia/Hobart": "tas",
  "Australia/Canberra": "act",
};

/** The state a browser's time zone suggests, used to try that state first. */
export function regionFromTimeZone(timeZone: string | undefined): string | null {
  return (timeZone && TIMEZONE_REGION[timeZone]) || null;
}

// Longest first, so "senior high school" wins over "high school".
const SCHOOL_TYPES: Array<[RegExp, string[]]> = [
  [/ senior high school$/, ["shs"]],
  [/ district high school$/, ["dhs"]],
  [/ senior secondary college$/, ["ssc"]],
  [/ secondary college$/, ["sc"]],
  [/ secondary school$/, ["ss"]],
  [/ high school$/, ["hs"]],
  [/ primary school$/, ["ps"]],
  [/ community college$/, ["cc"]],
  [/ community school$/, ["cs"]],
  [/ education support centre$/, ["esc"]],
  [/ grammar school$/, ["gs", "grammar"]],
  [/ college$/, ["", "c", "college"]],
  [/ school$/, ["", "s"]],
];

function words(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}

/**
 * Slugs worth trying for a school name, most likely first. The hinted region (from the time zone) goes first; the
 * list is capped so a lookup stays a handful of requests.
 */
export function guessSlugs(name: string, { region, limit = 40 }: { region?: string | null; limit?: number } = {}): string[] {
  const w = words(name);
  if (!w) return [];
  const stems = new Set<string>();
  let matched = false;
  for (const [re, shorts] of SCHOOL_TYPES) {
    if (!re.test(w)) continue;
    matched = true;
    const base = w.replace(re, "").replace(/ /g, "");
    for (const s of shorts) if (base) stems.add(base + s);
    break;
  }
  if (!matched) stems.add(w.replace(/ /g, ""));
  // Initials, for long names: "Australian Islamic College" -> aic.
  const parts = w.split(" ");
  if (parts.length >= 3) stems.add(parts.map(p => p[0]).join(""));

  const regions = [...new Set([region, ...AU_REGIONS].filter((r): r is string => !!r))];
  const out: string[] = [];
  for (const r of regions) for (const stem of stems) {
    const slug = `${stem}-${r}`;
    if (SLUG.test(slug)) out.push(slug);
  }
  return out.slice(0, limit);
}

/**
 * Finds a school's slug from its directory name: tries the guesses a few at a time and keeps the first whose login
 * page names the same school. Null when none does; "blocked" when Cloudflare refused every probe.
 */
export async function resolveSlug(
  name: string,
  { region, concurrency = 8, limit = 40 }: { region?: string | null; concurrency?: number; limit?: number } = {},
): Promise<{ slug: string; name: string } | null | "blocked"> {
  const queue = guessSlugs(name, { region, limit });
  const controller = new AbortController();
  let found: { slug: string; name: string } | null = null;
  let blocked = 0;
  let tried = 0;
  const worker = async () => {
    while (!found && queue.length) {
      const slug = queue.shift()!;
      tried++;
      try {
        const p = await probeSchool(slug, { signal: controller.signal });
        if (p.kind === "blocked") blocked++;
        if (p.kind === "found" && sameSchoolName(p.name, name) && !found) {
          found = { slug: p.slug, name: p.name };
          controller.abort();
        }
      } catch {
        // Aborted once another worker found it.
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (found) return found;
  return tried > 0 && blocked === tried ? "blocked" : null;
}
