import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@compassneo/backend/api";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/glaze/ui/field";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/glaze/ui/combobox";
import { Icon, Link, Pending, School as SchoolGlyph } from "@/components/glaze/icon";
import { hostOf, regionHint, unbreakable, useDebounced, useDirectory, useRecentSchools, type School } from "@/lib/neo/schools";
import { looksLikeSlug, normalizeSlug } from "@/lib/neo/slug";
import { morph } from "@/lib/neo/morph";
import type { AddressHint } from "./address-step";

type Option =
  | { kind: "school"; key: string; name: string; slug: string }
  | { kind: "directory"; key: string; name: string; organisationId: string }
  | { kind: "address"; key: string; name: string; slug: string };

const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, "") === b.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Which school. Type a name and three sources answer: schools this device used, schools anyone has signed in to
 * (Convex), and Compass's own directory. Paste an address and it is offered as is. Picking a directory school
 * finds its address on Compass and remembers it for everyone.
 */
export function SchoolStep({
  focusOnMount,
  onChoose,
  onNeedAddress,
}: {
  focusOnMount: boolean;
  onChoose: (s: School) => void;
  onNeedAddress: (hint: AddressHint) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recent = useRecentSchools();
  const settled = useDebounced(q.trim(), 220);
  const known = useQuery(api.schools.search, { q: settled });
  const directory = useDirectory(settled);
  const resolve = useAction(api.schools.resolve);
  const verify = useAction(api.schools.verify);

  const options = useMemo(() => {
    const text = q.trim();
    const lower = text.toLowerCase();
    const out: Option[] = [];
    const seen = new Set<string>();
    const add = (o: Option) => {
      if (seen.has(o.key)) return;
      seen.add(o.key);
      out.push(o);
    };
    const school = (s: School): Option => ({ kind: "school", key: `s:${s.slug}`, name: s.name, slug: s.slug });

    const address = looksLikeSlug(text) ? normalizeSlug(text) : null;
    if (address) add({ kind: "address", key: `a:${address}`, name: hostOf(address), slug: address });
    for (const s of recent) if (!text || s.name.toLowerCase().includes(lower) || s.slug.startsWith(lower)) add(school(s));
    for (const s of known ?? []) add(school(s));
    for (const d of directory.items) {
      if (d.slug) add(school({ slug: d.slug, name: d.name }));
      else if (!out.some(o => o.kind === "school" && sameName(o.name, d.name)))
        add({ kind: "directory", key: `d:${d.organisationId}`, name: d.name, organisationId: d.organisationId });
    }
    return out.slice(0, 12);
  }, [q, recent, known, directory.items]);

  const pick = async (o: Option | null) => {
    if (!o) return;
    setError(null);
    if (o.kind === "school") return onChoose({ slug: o.slug, name: o.name });
    setQ(o.kind === "address" ? o.slug : o.name);
    setBusy(o.name);
    try {
      if (o.kind === "address") {
        const r = await verify({ slug: o.slug });
        if (r.status === "found") return onChoose(r.school);
        const message = r.status === "blocked" ? "Compass did not answer just now; try again in a minute." : `No Compass school answers at ${unbreakable(o.name)}; check the spelling.`;
        void morph(() => setError(message));
      } else {
        const r = await resolve({ organisationId: o.organisationId, name: o.name, region: regionHint() });
        if (r.status === "found") return onChoose({ slug: r.school.slug, name: r.school.name });
        onNeedAddress({ name: o.name, organisationId: o.organisationId });
      }
    } catch {
      void morph(() => setError("Compass Neo could not reach its server; check your connection and try again."));
    } finally {
      setBusy(null);
    }
  };

  const text = q.trim();
  const empty = text.length < 3 ? "Type at least three letters of your school's name." : `No schools match ${text}.`;

  return (
    <div className="flex flex-col gap-3">
      {/* The field is the morph's source: picking a school turns it into the school card. */}
      <Field invalid={!!error} className="neo-vt-school">
        <FieldLabel>School</FieldLabel>
        <Combobox<Option>
          items={options}
          filter={null}
          pending={directory.pending && options.length === 0}
          inputValue={q}
          onInputValueChange={v => {
            setQ(v);
            setError(null);
          }}
          value={null}
          onValueChange={pick}
          itemToStringLabel={o => o.name}
          isItemEqualToValue={(a, b) => a.key === b.key}
          autoHighlight
          openOnInputClick
          // Read-only, not disabled, while a pick is checked: the field keeps focus, so a failed check leaves the
          // cursor where the person was typing.
          readOnly={!!busy}
        >
          <ComboboxInput
            size="lg"
            showSearchIcon
            showTrigger={false}
            placeholder="Thornlie Senior High School"
            autoFocus={focusOnMount}
            aria-invalid={!!error}
          />
          <ComboboxContent>
            <ComboboxEmpty>{empty}</ComboboxEmpty>
            <ComboboxList>
              {(o: Option) => (
                <ComboboxItem key={o.key} value={o}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon icon={o.kind === "address" ? Link : SchoolGlyph} className="text-text-3" />
                    <span className={o.kind === "address" ? "mono truncate" : "truncate"}>{o.name}</span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {error ? <FieldError>{error}</FieldError> : <FieldDescription>Search by name, or paste your school's Compass address.</FieldDescription>}
      </Field>
      <p role="status" className="flex min-h-lh items-center gap-2 type-body-sm text-text-2">
        {busy && (
          <>
            <Icon icon={Pending} className="animate-spin text-neo-text motion-reduce:animate-none" />
            Finding {busy} on Compass
          </>
        )}
      </p>
    </div>
  );
}
