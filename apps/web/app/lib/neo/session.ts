import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "./live";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted } from "./store";
import { forgetDays } from "./timetable";

export type Me = NonNullable<FunctionReturnType<typeof api.auth.me>>;

type Stored = { token: string; me: Me };

/** This device's session: the token Convex knows it by, and the last profile it sent, for an instant first paint. */
export const sessionStore = persisted<Stored | null>("cneo.session.v1", null);

/**
 * A guest's sign-in on this device (guest mode: a friend checking their timetable), kept beside the device's own and
 * never in its place. While there is one, home is the guest's day and nothing else (features/guest). The server lets
 * a guest's token read the timetable only, and ends it by itself after a school day (convex/auth.ts GUEST_FOR).
 */
export const guestStore = persisted<Stored | null>("cneo.guest.v1", null);

/** Why this device was signed out, shown once on the login screen ("Your Compass password has changed."). */
export const signOutNotice = persisted<string | null>("cneo.notice.v1", null);

export type SessionState =
  | { status: "signed-out"; me: null; token: null }
  | { status: "checking" | "signed-in"; me: Me; token: string };

export type Guest = Stored;

type SignOut = (args: { token: string }) => Promise<unknown>;

/** Ends guest mode: off the device at once, then signed out on the server (the account goes too, if it was its only device). */
async function dropGuest(signOut: SignOut) {
  const token = guestStore.get()?.token;
  if (!token) return;
  guestStore.set(null);
  await signOut({ token }).catch(() => {});
}

/**
 * Who is signed in. Renders from the cached profile straight away, then follows Convex: a session the server no
 * longer knows signs this device out, and a changed profile replaces the cached one. A guest only ever borrows a
 * device that is signed in: the device's own session ending ends the guest's too (and a guest somehow left without
 * one is cleared when the device next signs in, login-screen.tsx).
 */
export function useSession(): SessionState {
  const stored = sessionStore.use();
  const live = useQuery(api.auth.me, stored ? { token: stored.token } : "skip");
  const signOut = useMutation(api.auth.signOut);

  useEffect(() => {
    if (!stored || live === undefined) return;
    if (live === null) {
      sessionStore.set(null);
      void dropGuest(signOut);
    } else if (JSON.stringify(live) !== JSON.stringify(stored.me)) sessionStore.set({ token: stored.token, me: live });
  }, [stored, live, signOut]);

  if (!stored) return { status: "signed-out", me: null, token: null };
  return { status: live === undefined ? "checking" : "signed-in", me: live ?? stored.me, token: stored.token };
}

/**
 * The guest on this device, if there is one: their token and profile, from the cache at once, then following Convex.
 * A guest's sign-in the server no longer knows (signed out elsewhere, or past its school day) just goes, quietly: the
 * device is back on its own account, with nothing to tell anyone.
 */
export function useGuest(): Guest | null {
  const stored = guestStore.use();
  const live = useQuery(api.auth.me, stored ? { token: stored.token } : "skip");

  useEffect(() => {
    if (!stored || live === undefined) return;
    if (live === null) guestStore.set(null);
    else if (JSON.stringify(live) !== JSON.stringify(stored.me)) guestStore.set({ token: stored.token, me: live });
  }, [stored, live]);

  return stored && { token: stored.token, me: live ?? stored.me };
}

/** Ends guest mode at once (the banner's Sign out): the device is its own again before the server hears. */
export function useEndGuest() {
  const signOut = useMutation(api.auth.signOut);
  return () => dropGuest(signOut);
}

/** Signs this device out, and any guest on it with it. */
export function useSignOut() {
  const signOut = useMutation(api.auth.signOut);
  return async () => {
    const token = sessionStore.get()?.token;
    sessionStore.set(null);
    forgetDays();
    await dropGuest(signOut);
    if (token) await signOut({ token }).catch(() => {});
  };
}
