import { useCallback, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "./live";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { useLoadOnce } from "./loads";

/**
 * A class's work (convex/work.ts): Compass's learning tasks and Connect's submissions, each a WorkItem with the
 * teacher's instructions (plain blocks, like a lesson plan), attachments, its state, what was handed in, and the slots
 * work goes in on. Handing in uploads the file to Convex storage first, then the server passes it on to Compass or
 * Connect, exactly as their own upload windows do.
 *
 * state: "todo" | "overdue" | "submitted" | "late" | "closed" | "none" (Compass has no online slot for it). The server
 * works out "overdue" when the data was fetched; a "todo" whose due date has since passed is overdue too.
 */

export type ClassWork = NonNullable<FunctionReturnType<typeof api.work.forClass>>;
export type WorkSide = ClassWork["compass"];
export type WorkItem = Extract<WorkSide, { status: "ready" }>["data"][number];
export type WorkFile = WorkItem["handedIn"][number];
export type WorkSlot = WorkItem["slots"][number];

export function useClassWork(token: string | null, code: string | null) {
  const data = useQuery(api.work.forClass, token && code ? { token, code } : "skip");
  const load = useAction(api.work.load);
  useLoadOnce(token && code ? `work:${code}` : null, () => load({ token: token!, code: code! }), 2 * 60_000);
  return data;
}

/** The largest file the server will pass on (convex/work.ts MAX_UPLOAD). */
export const MAX_UPLOAD = 40 * 1024 * 1024;

export type HandInResult = { ok: true } | { ok: false; message: string };

/**
 * Hands work in on one slot of one item: a file, or (on a Compass slot that takes one) a link. Resolves when Compass or
 * Connect has it; the work query updates by itself after. Never throws.
 */
export function useHandIn(token: string | null, code: string | null) {
  const uploadUrl = useMutation(api.work.uploadUrl);
  const submit = useAction(api.work.submit);
  const [busy, setBusy] = useState<string | null>(null);

  const handIn = useCallback(
    async (item: Pick<WorkItem, "key">, slotId: number, what: { file: File } | { url: string }): Promise<HandInResult> => {
      if (!token || !code) return { ok: false, message: "This device is signed out." };
      setBusy(item.key);
      try {
        if ("file" in what) {
          if (what.file.size > MAX_UPLOAD) return { ok: false, message: "That file is over 40 MB. Hand it in on Compass itself." };
          const url = await uploadUrl({ token });
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": what.file.type || "application/octet-stream" }, body: what.file });
          if (!res.ok) return { ok: false, message: "The file did not upload. Try again." };
          const { storageId } = (await res.json()) as { storageId: string };
          const r = await submit({ token, code, key: item.key, slotId, file: { storageId: storageId as never, name: what.file.name } });
          return r.ok ? r : { ok: false, message: r.message };
        }
        const r = await submit({ token, code, key: item.key, slotId, url: what.url });
        return r.ok ? r : { ok: false, message: r.message };
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
