import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { connectFile } from "@compassneo/connect";
import { withCompass } from "./lib/compass";
import { withConnect } from "./lib/connect";
import { readLink } from "./lib/links";

/**
 * GET /file/<link>/<name>: a file from Compass or Connect, fetched with the account's session (lib/links.ts says which
 * file and account; its MAC says the link was made here). ?dl=1 saves it instead of opening it in the tab.
 */

/** An HTTP action answers at most 20 MB; a file over this is sent back to Compass. */
const MAX_BYTES = 19 * 1024 * 1024;
/** Opened in the tab rather than saved: what a browser shows by itself. */
const INLINE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif|bmp)|text\/plain|video\/(mp4|webm)|audio\/)/i;

/** The app fetches files itself (its viewer and zips), from its own origin. A link is the only credential. */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, Content-Length" };

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...CORS } });

const fileRoute = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const [, , token, rawName] = url.pathname.split("/");
  const link = token ? await readLink(token) : null;
  if (!link) return text(404, "This link is not one Compass Neo made.");
  const account = await ctx.runQuery(internal.accounts.byId, { accountId: link.accountId });
  if (!account) return text(410, "This file belonged to an account that has signed out of Compass Neo.");

  const got =
    link.source === "compass"
      ? await withCompass(ctx, account, s => s.file(link.path))
      : await withConnect(ctx, account, c => connectFile(c, link.path));
  if (!got.ok) return text(502, got.message);
  const file = got.value;
  if (!file) return text(404, "Compass did not find that file. It may have been moved or deleted.");
  if (file.bytes.byteLength > MAX_BYTES) return text(413, "This file is too big for Compass Neo to pass on. Open it in Compass instead.");

  const name = (file.name ?? (rawName ? decodeURIComponent(rawName) : "file")).replace(/["\r\n]/g, "");
  const type = !file.type || /octet-stream/i.test(file.type) ? guessType(name) : file.type;
  const inline = url.searchParams.get("dl") !== "1" && INLINE.test(type);
  return new Response(file.bytes, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Private to this browser; photos are asked for often, files rarely.
      "Cache-Control": /^image\//.test(type) ? "private, max-age=86400" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ...CORS,
      // A file from a teacher is shown as itself, never run as part of a page.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src data: blob:; media-src 'self'; style-src 'unsafe-inline'",
    },
  });
});

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain; charset=utf-8",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};
const guessType = (name: string) => TYPES[/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ""] ?? "application/octet-stream";

const http = httpRouter();
http.route({ pathPrefix: "/file/", method: "GET", handler: fileRoute });
export default http;
