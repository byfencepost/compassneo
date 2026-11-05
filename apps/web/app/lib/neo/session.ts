import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted } from "./store";
import { forgetDays } from "./timetable";

export type Me = NonNullable<FunctionReturnType<typeof api.auth.me>>;

type Stored = { token: string; me: Me };

/** This device's session: the token Convex knows it by, and the last profile it sent, for an instant first paint. */
export const sessionStore = persisted<Stored | null>("cneo.session.v1", null);

/** Why this device was signed out, shown once on the login screen ("Your Compass password has changed."). */
export const signOutNotice = persisted<string | null>("cneo.notice.v1", null);

export type SessionState =
  | { status: "signed-out"; me: null; token: null }
  | { status: "checking" | "signed-in"; me: Me; token: string };

/**
 * Who is signed in. Renders from the cached profile straight away, then follows Convex: a session the server no
 * longer knows signs this device out, and a changed profile replaces the cached one.
 */
export function useSession(): SessionState {
  const stored = sessionStore.use();
  const live = useQuery(api.auth.me, stored ? { token: stored.token } : "skip");

  useEffect(() => {
    if (!stored || live === undefined) return;
    if (live === null) sessionStore.set(null);
    else if (JSON.stringify(live) !== JSON.stringify(stored.me)) sessionStore.set({ token: stored.token, me: live });
  }, [stored, live]);

  if (!stored) return { status: "signed-out", me: null, token: null };
  return { status: live === undefined ? "checking" : "signed-in", me: live ?? stored.me, token: stored.token };
}

export function useSignOut() {
  const signOut = useMutation(api.auth.signOut);
  return async () => {
    const token = sessionStore.get()?.token;
    sessionStore.set(null);
    forgetDays();
    if (token) await signOut({ token }).catch(() => {});
  };
}
