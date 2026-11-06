import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@compassneo/backend/api";
import { cn } from "@/lib/glaze/utils";
import { Field, FieldError, FieldLabel, Form } from "@/components/glaze/ui/field";
import { Input } from "@/components/glaze/ui/input";
import { Button } from "@/components/glaze/ui/button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/glaze/ui/alert";
import { Icon, School as SchoolGlyph } from "@/components/glaze/icon";
import { hostOf, type School } from "@/lib/neo/schools";
import type { Me } from "@/lib/neo/session";
import { morph } from "@/lib/neo/morph";

type Notice = { status: "warn" | "fail"; title: string; body: string; action?: "open-compass" | "change-school" };

const requireValue = (message: string) => (v: unknown) => (String(v ?? "").trim() ? null : message);

type SignInAnswer = FunctionReturnType<typeof api.auth.signIn>;

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The sign-in, tried again on a hiccup. The server already tries Compass three times (packages/compass/src/retry.ts),
 * so here it is the trip to Compass Neo's own server that is retried: a dropped connection or a function that timed
 * out, twice more. Compass still not answering after the server's tries gets one more go after a short wait, as
 * people otherwise just press the button again. An answer about the login itself (a wrong password, two-step,
 * the rate limit) comes back at once: the server counts each try against the account's ten-minute limit.
 */
async function signInRetrying(call: () => Promise<SignInAnswer>): Promise<SignInAnswer> {
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

/** A sign-in the screen will not take after all, said in place of the form's answer (guest mode's own account). */
export type Refusal = { title: string; body: string };

/**
 * Who you are: the chosen school as a card you can change, then username and password.
 *
 * guest: a friend signing in on this device beside its own sign-in (features/guest): the sign-in is a guest's
 * (convex/auth.ts), and the browser is asked neither to fill in the device's saved login nor to keep the friend's.
 * onSignedIn may refuse the sign-in it is handed, with what to say instead.
 */
export function CredentialsStep({
  focusOnMount,
  school,
  guest = false,
  onChangeSchool,
  onSignedIn,
}: {
  focusOnMount: boolean;
  school: School;
  guest?: boolean;
  onChangeSchool: () => void;
  onSignedIn: (token: string, me: Me, cached: boolean) => void | Refusal | Promise<void | Refusal>;
}) {
  const signIn = useAction(api.auth.signIn);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shaking, setShaking] = useState(false);

  const submit = async (values: Record<string, unknown>) => {
    const username = String(values.username ?? "").trim();
    const password = String(values.password ?? "");
    if (notice || Object.keys(errors).length) {
      void morph(() => {
        setNotice(null);
        setErrors({});
      });
    }
    setPending(true);
    try {
      const r = await signInRetrying(() => signIn({ slug: school.slug, username, password, ...(guest ? { guest: true } : {}) }));
      const show = (next: { errors?: Record<string, string>; notice?: Notice }) =>
        morph(() => {
          setPending(false);
          setErrors(next.errors ?? {});
          setNotice(next.notice ?? null);
        });
      if (r.ok) {
        // Stay pending: the screen hands over to the app from here, unless it will not take this sign-in.
        const refused = await onSignedIn(r.token, r.me, r.cached);
        if (refused) void show({ notice: { status: "warn", ...refused } });
        return;
      }
      switch (r.code) {
        case "bad-credentials":
          // The form shakes once the button has finished gliding under the new error.
          void show({ errors: { password: "That username and password did not match your Compass account." } }).then(() => setShaking(true));
          break;
        case "two-factor":
          void show({
            notice: {
              status: "warn",
              title: "This account uses two-step sign-in",
              body: "Compass Neo cannot do two-step sign-in yet. You can still sign in on Compass itself.",
              action: "open-compass",
            },
          });
          break;
        case "rate-limited":
          void show({ notice: { status: "warn", title: "Too many tries for this account", body: "Wait ten minutes, then try again." } });
          break;
        case "unknown-school":
          void show({
            notice: {
              status: "fail",
              title: `${school.name} is not answering on Compass`,
              body: "Its address may have changed. Choose the school again.",
              action: "change-school",
            },
          });
          break;
        default:
          void show({ notice: { status: "fail", title: "Compass did not answer", body: "Your school's Compass may be busy or down. Try again in a minute." } });
      }
    } catch {
      void morph(() => {
        setPending(false);
        setNotice({ status: "fail", title: "Compass Neo could not reach its server", body: "Check your connection, then try again." });
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* The morph's target: the school field from the step before becomes this card. */}
      <div className="neo-vt-school shell">
        <div className="panel flex items-start gap-3 p-3">
          <Icon icon={SchoolGlyph} size={20} className="text-neo-text" />
          <div className="min-w-0 flex-1">
            <p className="type-label text-text-1">{school.name}</p>
            <p className="truncate type-caption text-text-2">
              <span className="mono">{hostOf(school.slug)}</span>
            </p>
          </div>
        </div>
        <div className="shell-foot">
          <p className="me-auto type-caption text-text-2">Not your school?</p>
          <Button size="sm" variant="secondary" onClick={onChangeSchool} disabled={pending}>
            Change school
          </Button>
        </div>
      </div>

      <Form
        errors={errors}
        pending={pending}
        onFormSubmit={submit}
        className={cn(shaking && "neo-shake")}
        onAnimationEnd={() => setShaking(false)}
      >
        <Field name="username" validate={requireValue("Enter the username you use for Compass.")}>
          <FieldLabel>Username</FieldLabel>
          <Input
            name="username"
            size="lg"
            autoComplete={guest ? "off" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="jordan.lee"
            autoFocus={focusOnMount}
            {...(guest ? { "data-1p-ignore": true, "data-lpignore": "true" } : {})}
          />
          <FieldError />
        </Field>
        <Field name="password" validate={requireValue("Enter your Compass password.")}>
          <FieldLabel>Password</FieldLabel>
          <Input
            mode="password"
            name="password"
            size="lg"
            autoComplete={guest ? "off" : "current-password"}
            {...(guest ? { "data-1p-ignore": true, "data-lpignore": "true" } : {})}
          />
          <FieldError />
        </Field>

        {notice && (
          <Alert status={notice.status}>
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription>{notice.body}</AlertDescription>
            {notice.action === "open-compass" && (
              <AlertAction>
                <Button size="sm" variant="secondary" render={<a href={`https://${hostOf(school.slug)}`} target="_blank" rel="noreferrer" />} nativeButton={false}>
                  Open Compass
                </Button>
              </AlertAction>
            )}
            {notice.action === "change-school" && (
              <AlertAction>
                <Button size="sm" variant="secondary" onClick={onChangeSchool}>
                  Change school
                </Button>
              </AlertAction>
            )}
          </Alert>
        )}

        <Button type="submit" size="lg" className="neo-vt-go mt-1 w-full" pending={pending} pendingLabel="Signing in">
          {guest ? "Sign in as guest" : "Sign in"}
        </Button>
      </Form>
    </div>
  );
}
