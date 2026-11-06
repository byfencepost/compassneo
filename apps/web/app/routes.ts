import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("settings", "routes/settings.tsx"),
  // Guest mode: a friend signs in beside this device's own sign-in, to see their timetable (features/guest).
  route("guest", "routes/guest.tsx"),
  // /login, or /login/thornlieshs-wa to open straight on a school.
  route("login/:school?", "routes/login.tsx"),
] satisfies RouteConfig;
