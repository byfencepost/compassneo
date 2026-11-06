import { useState } from "react";
import { Navigate } from "react-router";
import type { Route } from "./+types/guest";
import { guestStore, useSession } from "@/lib/neo/session";
import { GuestSignIn } from "@/features/guest/guest-sign-in";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Guest mode · Compass Neo" }];
}

/**
 * Guest mode's sign-in (features/guest). Only a device signed in itself lends itself to a guest; one with a guest on
 * already is sent to the guest's day. Signing a guest in here hands over by itself, with the morph into home.
 */
export default function Guest() {
  const session = useSession();
  const [arrivedWithGuest] = useState(() => !!guestStore.get());
  if (session.status === "signed-out" || !session.me) return <Navigate to="/login" replace />;
  if (arrivedWithGuest) return <Navigate to="/" replace />;
  return <GuestSignIn owner={session.me} />;
}
