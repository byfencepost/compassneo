import { useState } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import type { Route } from "./+types/login";
import { useSession } from "@/lib/neo/session";
import { LoginScreen } from "@/features/login/login-screen";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sign in · Compass Neo" },
    { name: "description", content: "Sign in to Compass Neo with your school's Compass account." },
  ];
}

export default function Login() {
  const { school } = useParams();
  const location = useLocation();
  const session = useSession();
  // Only a device that arrives signed in is sent home from here. Signing in on this screen hands over by itself, with
  // the morph into the app, and signing out arrives here while the session is still being cleared.
  const [arrivedSignedIn] = useState(() => session.status !== "signed-out" && !(location.state as { signedOut?: boolean } | null)?.signedOut);
  if (arrivedSignedIn) return <Navigate to="/" replace />;
  return <LoginScreen slugParam={school} />;
}
