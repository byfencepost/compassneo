import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { persisted, useStored } from "./store";
import { signOutNotice } from "./notice";
import { forgetDays } from "./timetable";
import { endGuest } from "./guest";

export type Me = NonNullable<FunctionReturnType<typeof api.auth.me>>;

/** The token Convex knows this device by (keychain), and the last profile it sent (for an instant first paint). */
const tokenStore = persisted<string | null>("cneo.token.v1", null, { secure: true });
const meStore = persisted<Me | null>("cneo.me.v1", null);

export { signOutNotice } from "./notice";

export type SessionState =
  | { status: "signed-out"; me: null; token: null }
  | { status: "checking" | "signed-in"; me: Me; token: string };

/** Keeps a fresh sign-in on the device. The root layout's guard sends the person into the app from here. */
export function keepSession(token: string, me: Me) {
  meStore.set(me);
  tokenStore.set(token);
  signOutNotice.set(null);
}

/** The token alone, for code outside React (sync on resume). */
export const currentToken = () => tokenStore.get();

/**
 * Who is signed in. Renders from the cached profile straight away, then follows Convex: a session the server no
 * longer knows signs this device out, and a changed profile replaces the cached one.
 */
export function useSession(): SessionState {
  const token = useStored(tokenStore);
  const cached = useStored(meStore);
  const live = useQuery(api.auth.me, token ? { token } : "skip");

  useEffect(() => {
    if (!token || live === undefined) return;
    if (live === null) {
      tokenStore.set(null);
      meStore.set(null);
    } else if (JSON.stringify(live) !== JSON.stringify(cached)) meStore.set(live);
  }, [token, live, cached]);

  const me = live ?? cached;
  if (!token || !me) return { status: "signed-out", me: null, token: null };
  return { status: live === undefined ? "checking" : "signed-in", me, token };
}

/** Signs this device out, and any guest on it (lib/guest.ts). The last device out takes the account with it (convex/auth.ts). */
export function useSignOut() {
  const signOut = useMutation(api.auth.signOut);
  return async () => {
    endGuest(signOut);
    const token = tokenStore.get();
    tokenStore.set(null);
    meStore.set(null);
    forgetDays();
    if (token) await signOut({ token }).catch(() => {});
  };
}
