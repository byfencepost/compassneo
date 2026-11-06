import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { hostOf, type School } from "@/lib/schools";

/**
 * What the sign-in steps say when something does not work, word for word as the web says it
 * (apps/web/app/features/login), and the sign-in's retry. Kept apart from the steps so the copy has one home.
 */

export type SignInAnswer = FunctionReturnType<typeof api.auth.signIn>;
type SignedIn = Extract<SignInAnswer, { ok: true }>;
type SignInCode = Extract<SignInAnswer, { ok: false }>["code"];
type Verification = FunctionReturnType<typeof api.schools.verify>;
type Resolution = FunctionReturnType<typeof api.schools.resolve>;

/** Convex's actions as the steps hold them (useAction). */
type Call<F extends typeof api.auth.signIn | typeof api.schools.verify | typeof api.schools.resolve> = (
  args: FunctionArgs<F>,
) => Promise<FunctionReturnType<F>>;

/*
 * The steps' trips to the server live out here, as plain async functions that always answer (never throw), so the
 * step components hold no try blocks: the React Compiler cannot compile a component with one yet, and would leave it
 * unmemoized.
 */

/** Keeps a school's address on one line: its hyphens become non-breaking ones. */
export const unbreakable = (host: string) => host.replace(/-/g, "‑");

/** Convex itself could not be reached (no connection, or the function failed). */
export const UNREACHABLE = "Compass Neo could not reach its server; check your connection and try again.";

/** Typed text that cannot be a Compass address at all. */
export const NOT_AN_ADDRESS = "Use the part before .compass.education, such as yourschool-vic.";

/** Why an address the person typed or picked is not a school: Compass was busy, or nothing answers there. */
export function addressProblem(r: Exclude<Verification, { status: "found" }>, slug: string) {
  return r.status === "blocked"
    ? "Compass did not answer just now; try again in a minute."
    : `No Compass school answers at ${unbreakable(hostOf(slug))}; check the spelling.`;
}

export type SignInNotice = {
  status: "warn" | "fail";
  title: string;
  body: string;
  action?: "open-compass" | "change-school";
};

/** A failed sign-in, as the credentials step shows it: under the password, or as a notice above the button. */
export type SignInProblem = { field: "password"; message: string } | { notice: SignInNotice };

export function signInProblem(code: SignInCode, school: School): SignInProblem {
  switch (code) {
    case "bad-credentials":
      return { field: "password", message: "That username and password did not match your Compass account." };
    case "two-factor":
      return {
        notice: {
          status: "warn",
          title: "This account uses two-step sign-in",
          body: "Compass Neo cannot do two-step sign-in yet. You can still sign in on Compass itself.",
          action: "open-compass",
        },
      };
    case "rate-limited":
      return { notice: { status: "warn", title: "Too many tries for this account", body: "Wait ten minutes, then try again." } };
    case "unknown-school":
      return {
        notice: {
          status: "fail",
          title: `${school.name} is not answering on Compass`,
          body: "Its address may have changed. Choose the school again.",
          action: "change-school",
        },
      };
    default:
      return { notice: { status: "fail", title: "Compass did not answer", body: "Your school's Compass may be busy or down. Try again in a minute." } };
  }
}

/** The sign-in never reached Compass Neo's server. */
export const UNREACHABLE_NOTICE: SignInNotice = {
  status: "fail",
  title: "Compass Neo could not reach its server",
  body: "Check your connection, then try again.",
};

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The sign-in, tried again on a hiccup, as the web does it. The server already tries Compass three times
 * (packages/compass/src/retry.ts), so here it is the trip to Compass Neo's own server that is retried: a dropped
 * connection or a function that timed out, twice more. Compass still not answering after the server's tries gets one
 * more go after a short wait, as people otherwise just press the button again. An answer about the login itself (a
 * wrong password, two-step, the rate limit) comes back at once: the server counts each try against the account's
 * ten-minute limit.
 */
export async function signInRetrying(call: () => Promise<SignInAnswer>): Promise<SignInAnswer> {
  let busyRetried = false;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await call();
      if (!r.ok && r.code === "upstream" && !busyRetried) {
        busyRetried = true;
        await pause(1500);
        continue;
      }
      return r;
    } catch (e) {
      if (attempt >= 3) throw e;
      await pause(600 * attempt + Math.random() * 400);
    }
  }
}

/** A school's address checked: the school it is, or what to say about it. */
export async function checkAddress(verify: Call<typeof api.schools.verify>, slug: string): Promise<{ school: School } | { error: string }> {
  let r: Verification;
  try {
    r = await verify({ slug });
  } catch {
    return { error: UNREACHABLE };
  }
  return r.status === "found" ? { school: { slug: r.school.slug, name: r.school.name } } : { error: addressProblem(r, slug) };
}

/**
 * A directory school's address found on Compass: the school, or `lost` when Compass Neo cannot work it out (the
 * address step takes over), or what to say when the server could not be reached.
 */
export async function findSchool(
  resolve: Call<typeof api.schools.resolve>,
  args: FunctionArgs<typeof api.schools.resolve>,
): Promise<{ school: School } | { lost: true } | { error: string }> {
  let r: Resolution;
  try {
    r = await resolve(args);
  } catch {
    return { error: UNREACHABLE };
  }
  return r.status === "found" ? { school: { slug: r.school.slug, name: r.school.name } } : { lost: true };
}

/** A sign-in, retried as above: the session, or the problem to show. `guest`: a friend's, in guest mode (lib/guest.ts). */
export async function attemptSignIn(
  signIn: Call<typeof api.auth.signIn>,
  school: School,
  username: string,
  password: string,
  guest = false,
): Promise<SignedIn | { ok: false; problem: SignInProblem }> {
  let r: SignInAnswer;
  try {
    r = await signInRetrying(() => signIn({ slug: school.slug, username, password, ...(guest ? { guest: true } : {}) }));
  } catch {
    return { ok: false, problem: { notice: UNREACHABLE_NOTICE } };
  }
  return r.ok ? r : { ok: false, problem: signInProblem(r.code, school) };
}
