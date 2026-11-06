import { persisted } from "./store";

/**
 * Why this device was signed out, shown once on the sign-in screen ("Your Compass password has changed."). On its own
 * so the timetable and sync can set it without importing the session (which imports them).
 */
export const signOutNotice = persisted<string | null>("cneo.notice.v1", null);
