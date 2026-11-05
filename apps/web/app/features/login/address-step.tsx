import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@compassneo/backend/api";
import { Field, FieldDescription, FieldError, FieldLabel, Form, FormActions } from "@/components/glaze/ui/field";
import { Input } from "@/components/glaze/ui/input";
import { Button } from "@/components/glaze/ui/button";
import { hostOf, unbreakable, type School } from "@/lib/neo/schools";
import { normalizeSlug } from "@/lib/neo/slug";
import { morph } from "@/lib/neo/morph";

export type AddressHint = { name: string; organisationId: string };

/**
 * The way through when Compass Neo cannot find a school's address on its own: the person types the part before
 * .compass.education. Pasting the whole address works too. A real address is remembered for everyone after them.
 */
export function AddressStep({
  focusOnMount,
  hint,
  initial,
  initialError,
  onChoose,
  onBack,
}: {
  focusOnMount: boolean;
  hint: AddressHint | null;
  initial?: string;
  initialError?: string;
  onChoose: (s: School) => void;
  onBack: () => void;
}) {
  const verify = useAction(api.schools.verify);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>(initialError ? { address: initialError } : {});

  const submit = async (values: Record<string, unknown>) => {
    const slug = normalizeSlug(String(values.address ?? ""));
    if (!slug) {
      void morph(() => setErrors({ address: "Use the part before .compass.education, such as thornlieshs-wa." }));
      return;
    }
    setPending(true);
    try {
      const r = await verify({ slug });
      if (r.status === "found") return onChoose(r.school);
      const address =
        r.status === "blocked"
          ? "Compass did not answer just now; try again in a minute."
          : `No Compass school answers at ${unbreakable(hostOf(slug))}; check the spelling.`;
      void morph(() => setErrors({ address }));
    } catch {
      void morph(() => setErrors({ address: "Compass Neo could not reach its server; check your connection and try again." }));
    } finally {
      setPending(false);
    }
  };

  return (
    <Form errors={errors} pending={pending} onFormSubmit={submit}>
      <Field name="address" className="neo-vt-school">
        <FieldLabel>Compass address</FieldLabel>
        <Input
          name="address"
          size="lg"
          mono
          defaultValue={initial}
          trailing={<span className="mono text-text-2">.compass.education</span>}
          placeholder="thornlieshs-wa"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={focusOnMount}
        />
        <FieldError />
        <FieldDescription>
          {hint ? `Compass Neo could not find ${hint.name} on its own. ` : ""}
          Open Compass in your browser and copy the start of the address.
        </FieldDescription>
      </Field>
      <FormActions>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="neo-vt-go flex-1" pending={pending} pendingLabel="Checking">
          Use this address
        </Button>
      </FormActions>
    </Form>
  );
}
