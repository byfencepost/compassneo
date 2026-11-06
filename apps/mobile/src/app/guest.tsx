import { GuestSignIn } from "@/features/guest/sign-in";

/** Guest mode's sign-in, pushed from Settings: a friend checks their timetable on this phone (features/guest). */
export default function GuestRoute() {
  return <GuestSignIn />;
}
