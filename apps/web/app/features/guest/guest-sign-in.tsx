import { useEffect, useRef, useState } from "react";
import { PrefetchPageLinks, useLocation, useNavigate } from "react-router";
import { useMutation } from "convex/react";
import { api } from "@compassneo/backend/api";
import { Button } from "@/components/glaze/ui/button";
import { ArrowLeft, Icon } from "@/components/glaze/icon";
import { coarsePointer } from "@/lib/glaze/portal";
import { cn } from "@/lib/glaze/utils";
import { useArrival } from "@/lib/neo/arrive";
import { morph, morphRoute } from "@/lib/neo/morph";
import type { School } from "@/lib/neo/schools";
import { guestStore, type Me } from "@/lib/neo/session";
import { SchoolStep } from "@/features/login/school-step";
import { AddressStep, type AddressHint } from "@/features/login/address-step";
import { CredentialsStep, type Refusal } from "@/features/login/credentials-step";

type Step = { kind: "school" } | { kind: "address"; hint: AddressHint | null } | { kind: "credentials"; school: School };

const stepLabel = (step: Step) =>
  step.kind === "school" ? "Choose your school" : step.kind === "address" ? "Enter your school's Compass address" : `Sign in to ${step.school.name}`;

/** The same Compass account: the school, and the username as Compass Neo keys it (convex/accounts.ts accountKey). */
const sameAccount = (a: Me, b: Me) => a.slug === b.slug && a.username.trim().toLowerCase() === b.username.trim().toLowerCase();

/**
 * Guest mode's sign-in, from the profile card: a friend signs in with their own Compass login to see their timetable,
 * and this device's own sign-in stays as it is underneath. It opens on the device's school (a friend is most likely at
 * the same one), with Change school for one who isn't, then the sign-in's own steps (features/login) morphing between
 * them as there. The sign-in is a guest's (convex/auth.ts): it reads the timetable only, and ends by itself.
 *
 * The device's own account is turned away (it would only sign this device in twice). Signed in, the guest is kept
 * beside the device's session (guestStore) and home morphs in as their day, with no sync to wait for: the day says
 * it is getting itself from Compass while the first sync runs. The arrow, or Escape, goes back to the day.
 */
export function GuestSignIn({ owner }: { owner: Me }) {
  const navigate = useNavigate();
  const location = useLocation();
  const arrival = useArrival();
  const signOut = useMutation(api.auth.signOut);
  const [step, setStep] = useState<Step>({ kind: "credentials", school: { slug: owner.slug, name: owner.schoolName } });
  // Bumps with each step, so focus can follow the person into the new one (as on the sign-in screen).
  const [stepKey, setStepKey] = useState(0);
  const section = useRef<HTMLElement>(null);
  const carryFocus = useRef(false);
  // A phone keeps its keyboard down until the person taps a field.
  const [focusOnMount] = useState(() => !coarsePointer());

  const go = (next: Step) => {
    carryFocus.current = !!section.current?.contains(document.activeElement);
    void morph(() => {
      setStep(next);
      setStepKey(k => k + 1);
    });
  };
  // A school picked here is the friend's: it is not added to this device's recent schools.
  const choose = (school: School) => go({ kind: "credentials", school });
  const changeSchool = () => go({ kind: "school" });

  useEffect(() => {
    if (stepKey === 0 || !carryFocus.current) return;
    carryFocus.current = false;
    if (section.current?.contains(document.activeElement)) return;
    section.current?.focus({ preventScroll: true });
  }, [stepKey]);

  // To the day: back through history when it is where this page was opened from, else straight there.
  const toDay = () => (location.key !== "default" ? navigate(-1) : navigate("/", { replace: true, flushSync: true }));
  const back = () => void morphRoute(toDay, "home");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable], [role=combobox], [role=listbox]")) return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const signedIn = async (token: string, me: Me): Promise<Refusal | void> => {
    if (sameAccount(me, owner)) {
      // Only the session just made goes: the device's own is another, so the account stays.
      await signOut({ token }).catch(() => {});
      return { title: "That's the account already signed in here", body: "Guest mode is for someone else's Compass login." };
    }
    void morphRoute(() => {
      guestStore.set({ token, me });
      return toDay();
    }, "home");
  };

  return (
    <div data-route="guest" className="min-h-dvh bg-page">
      <PrefetchPageLinks page="/" />
      <header className="neo-topbar sticky top-0 z-20">
        <div className="mx-auto flex w-full max-w-sm items-center gap-1 px-4 neo-safe-top pb-3">
          <Button variant="ghost" size="icon" aria-label="Cancel, back to today" onClick={back} className="-ms-2">
            <Icon icon={ArrowLeft} />
          </Button>
          <h1 className="type-heading text-text-1">Guest mode</h1>
        </div>
      </header>

      <main onAnimationEnd={arrival.onAnimationEnd} className={cn("mx-auto flex w-full max-w-sm flex-col gap-6 px-4 pb-10", arrival.className)}>
        <p className="type-body-sm text-text-2">
          Sign in with your own Compass login to see your timetable. {owner.displayName} stays signed in, and one press signs you out.
        </p>

        <section ref={section} tabIndex={-1} aria-label={stepLabel(step)} className="neo-vt-step">
          {step.kind === "school" && (
            <SchoolStep focusOnMount={focusOnMount} onChoose={choose} onNeedAddress={hint => go({ kind: "address", hint })} />
          )}
          {step.kind === "address" && <AddressStep focusOnMount={focusOnMount} hint={step.hint} onChoose={choose} onBack={changeSchool} />}
          {step.kind === "credentials" && (
            <CredentialsStep guest focusOnMount={focusOnMount} school={step.school} onChangeSchool={changeSchool} onSignedIn={signedIn} />
          )}
        </section>

        <p className="text-center type-caption text-text-2">Guest mode shows only your timetable, and signs you out by itself after eight hours.</p>
      </main>
    </div>
  );
}
