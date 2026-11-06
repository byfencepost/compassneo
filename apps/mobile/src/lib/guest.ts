import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@compassneo/backend/api";
import type { Me } from "./session";
import { persisted, useStored } from "./store";

/**
 * Guest mode: a friend signs in on this phone to check their own timetable, beside the phone's own sign-in, which
 * stays as it is underneath. Their session is a guest's on the server (convex/auth.ts): it reads the timetable and
 * nothing else, takes no notifications, and ends by itself after a school day. Home shows only their day while it is
 * on (features/guest), under a banner that signs them out with one press.
 *
 * Their token is kept in the keychain as the phone's own is, their profile beside it for the banner's first frame.
 * Their days are never kept on the phone (lib/timetable.ts, `keep: false`).
 */

const tokenStore = persisted<string | null>("cneo.guest.token.v1", null, { secure: true });
const meStore = persisted<Me | null>("cneo.guest.me.v1", null);

export type Guest = { token: string; me: Me };

/** A guest has signed in: home turns into their day (the root layout's guard closes the pages over it). */
export function startGuest(token: string, me: Me) {
  meStore.set(me);
  tokenStore.set(token);
}

/** Ends guest mode on the phone at once; returns the token, for signing it out on the server behind it. */
function dropGuest() {
  const token = tokenStore.get();
  tokenStore.set(null);
  meStore.set(null);
  return token;
}

/**
 * The guest signed in on this phone, or null. Follows Convex: a guest sign-in the server no longer knows (it ran out,
 * or the guest's password changed) ends guest mode quietly, and the phone is back to its own student.
 */
export function useGuest(): Guest | null {
  const token = useStored(tokenStore);
  const cached = useStored(meStore);
  const live = useQuery(api.auth.me, token ? { token } : "skip");

  useEffect(() => {
    if (!token || live === undefined) return;
    if (live === null) dropGuest();
    else if (JSON.stringify(live) !== JSON.stringify(cached)) meStore.set(live);
  }, [token, live, cached]);

  const me = live ?? cached;
  return token && me ? { token, me } : null;
}

/**
 * Ends guest mode: gone from the phone at once, and, given the sign-out, from the server behind it (their account too,
 * if this was their only device). Without it (the sync heard the guest's session is already gone), only the phone.
 */
export function endGuest(signOut?: (args: { token: string }) => Promise<unknown>) {
  const token = dropGuest();
  if (token && signOut) void signOut({ token }).catch(() => {});
}

/** The guest banner's Sign out. */
export function useEndGuest() {
  const signOut = useMutation(api.auth.signOut);
  return () => endGuest(signOut);
}
