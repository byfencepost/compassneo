import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useAction, useMutation } from "convex/react";
import { File } from "expo-file-system";
import { api } from "@compassneo/backend/api";
import type { Id } from "@compassneo/backend/dataModel";
import { signOutNotice } from "./notice";

/**
 * Handing work in from the phone, after the web's (apps/web/app/lib/neo/work.ts). The file goes to Convex storage first
 * (work.uploadUrl), streamed straight from where the picker left it, then work.submit passes it on to Compass or
 * Connect exactly as their own upload windows do and drops it from storage. A link (a Compass slot that takes one)
 * needs no upload. Once it is in, the server fetches the task or the submission again, so the class's work query
 * flips it to handed in by itself: nothing here has to reload.
 */

/** The largest file the server will pass on (convex/work.ts MAX_UPLOAD): an action holds the file in memory. */
export const MAX_UPLOAD = 40 * 1024 * 1024;

/** A file the phone picked: where it sits on the device, its name, and its type and size when the picker knew them. */
export type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number | null };

export type HandInResult = { ok: true } | { ok: false; message: string };

/** What goes in: a picked file, or a link. */
export type HandInWhat = { file: PickedFile } | { url: string };

/** How far the file has got on its way to storage, from 0 to 1. */
export type OnProgress = (share: number) => void;

/** A picked file's size: the picker's word for it, or (on a phone) the file's own, read from disk. */
export function sizeOf(file: PickedFile): number | null {
  if (file.size != null && file.size >= 0) return file.size;
  if (Platform.OS === "web") return null;
  try {
    return new File(file.uri).size;
  } catch {
    return null;
  }
}

/**
 * Posts a picked file's bytes, as they are, to a Convex upload URL, typed with Content-Type as Convex keeps it, and
 * returns the storage id Convex answers with ({ storageId }). On a phone the bytes stream from disk through
 * expo-file-system's native upload (File.upload, a raw binary body), so a big photo never sits in JavaScript's memory
 * and the progress comes with it. In the web build the picker's blob or data URL is read and posted with fetch.
 */
async function upload(url: string, file: PickedFile, type: string, onProgress?: OnProgress): Promise<string | null> {
  let status: number;
  let body: string;
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": type }, body: blob });
    status = res.status;
    body = await res.text();
  } else {
    const res = await new File(file.uri).upload(url, {
      httpMethod: "POST",
      // Android sends the body untyped, so the header is what types it; iOS takes the header as given.
      headers: { "Content-Type": type },
      mimeType: type,
      onProgress: p => {
        if (p.totalBytes > 0) onProgress?.(Math.min(1, p.bytesSent / p.totalBytes));
      },
    });
    status = res.status;
    body = res.body;
  }
  if (status < 200 || status >= 300) return null;
  try {
    return (JSON.parse(body) as { storageId?: string }).storageId ?? null;
  } catch {
    return null;
  }
}

/** An answer that says this device was signed out goes to the sign-in screen's notice, as every load's does. */
function heard(r: { ok: true } | { ok: false; code: string; message: string }): HandInResult {
  if (r.ok) return r;
  if (r.code === "signed-out" || r.code === "password-changed") signOutNotice.set(r.message);
  return { ok: false, message: r.message };
}

/**
 * Hands work in on one slot of one item: a file the phone picked, or (on a Compass slot that takes one) a link.
 * Resolves when Compass or Connect has it, or with why it did not go in; never throws. `busy` is the key of the item
 * on its way, if one is.
 */
export function useHandIn(token: string | null, code: string | null) {
  const uploadUrl = useMutation(api.work.uploadUrl);
  const submit = useAction(api.work.submit);
  const [busy, setBusy] = useState<string | null>(null);

  const handIn = useCallback(
    async (item: { key: string }, slotId: number, what: HandInWhat, onProgress?: OnProgress): Promise<HandInResult> => {
      if (!token || !code) return { ok: false, message: "This device is signed out." };
      setBusy(item.key);
      try {
        if ("file" in what) {
          const size = sizeOf(what.file);
          if (size != null && size > MAX_UPLOAD) return { ok: false, message: "That file is over 40 MB. Hand it in on Compass itself." };
          const url = await uploadUrl({ token });
          let storageId: string | null;
          try {
            storageId = await upload(url, what.file, what.file.mimeType || "application/octet-stream", onProgress);
          } catch {
            storageId = null;
          }
          if (!storageId) return { ok: false, message: "The file did not upload. Check the connection and try again." };
          return heard(await submit({ token, code, key: item.key, slotId, file: { storageId: storageId as Id<"_storage">, name: what.file.name } }));
        }
        return heard(await submit({ token, code, key: item.key, slotId, url: what.url }));
      } catch (e) {
        return { ok: false, message: e instanceof Error && e.message ? e.message : "Handing it in did not work." };
      } finally {
        setBusy(null);
      }
    },
    [token, code, uploadUrl, submit],
  );
  return { handIn, busy };
}
