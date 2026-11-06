import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { api } from "@compassneo/backend/api";
import { hostOf, looksLikeSlug, normalizeSlug, regionHint, useDebounced, useDirectory, useRecentSchools, type School } from "@/lib/schools";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { Text } from "@/components/ui/text";
import { Card, Rule } from "@/components/ui/card";
import { Row } from "@/components/ui/row";
import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import { GlassChip, Icon } from "@/components/ui/glass";
import { checkAddress, findSchool } from "./answers";
import { LoginField } from "./field";

/** A directory school Compass Neo could not find the address of on its own: the address step says so. */
export type AddressHint = { name: string; organisationId: string };

type Option =
  | { kind: "school"; key: string; name: string; slug: string }
  | { kind: "directory"; key: string; name: string; organisationId: string }
  | { kind: "address"; key: string; name: string; slug: string };

const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, "") === b.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The most rows the list shows; past that, more letters narrow it faster than scrolling would. */
const MOST = 12;

/**
 * Which school. Type a name and two sources answer: schools this phone used, and Compass's own directory, which lists
 * every Compass school, so the list never says which schools other people use Compass Neo at. Paste an address and it
 * is offered as is (named, if it is known). Picking a directory school finds its address on Compass and remembers it
 * for everyone; when that fails, the address step takes over with a hint. With the field empty, the schools this
 * phone has used are listed, so signing in again is one tap.
 */
export function SchoolStep({
  autoFocus,
  onChoose,
  onNeedAddress,
  onFieldFocus,
}: {
  autoFocus: boolean;
  onChoose: (s: School) => void;
  onNeedAddress: (hint: AddressHint | null) => void;
  onFieldFocus: () => void;
}) {
  const c = useTheme();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recent = useRecentSchools();
  const text = q.trim();
  const settled = useDebounced(text, 250);
  const known = useQuery(api.schools.search, looksLikeSlug(settled) ? { q: settled } : "skip");
  const directory = useDirectory(settled);
  const resolve = useAction(api.schools.resolve);
  const verify = useAction(api.schools.verify);
  // Moved on (to the address step) before a pick was checked: its answer is for a step the person has left.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const options = (() => {
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
    return out.slice(0, MOST);
  })();

  const fail = (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setError(message);
  };

  const pick = async (o: Option | undefined) => {
    if (!o || busy) return;
    setError(null);
    if (o.kind === "school") return onChoose({ slug: o.slug, name: o.name });
    setQ(o.kind === "address" ? o.slug : o.name);
    setBusy(o.name);
    const r =
      o.kind === "address"
        ? await checkAddress(verify, o.slug)
        : await findSchool(resolve, { organisationId: o.organisationId, name: o.name, region: regionHint() });
    if (!live.current) return;
    setBusy(null);
    if ("school" in r) onChoose(r.school);
    else if ("error" in r) fail(r.error);
    else if (o.kind === "directory") onNeedAddress({ name: o.name, organisationId: o.organisationId });
  };

  const searching = directory.pending || (text.length >= 3 && settled !== text);
  const empty = text.length < 3 ? "Type at least three letters of your school's name." : `No schools match ${text}.`;

  return (
    <View style={{ gap: space[4] }}>
      <LoginField
        label="School"
        value={q}
        onChangeText={v => {
          // While a pick is checked the field holds still, so the name it is finding stays in view.
          if (busy) return;
          setQ(v);
          setError(null);
        }}
        placeholder="Search for your school"
        autoFocus={autoFocus}
        autoCapitalize="words"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="organizationName"
        returnKeyType="search"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={() => void pick(options[0])}
        onFocus={onFieldFocus}
        error={error}
        hint={error ? undefined : "Search by name, or paste your school's Compass address."}
        leading={<Icon ios="magnifyingglass" android="search" size={18} color={c.text3} weight="medium" />}
        trailing={
          busy || (searching && text) ? (
            <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="small" color={c.text3} />
            </View>
          ) : q ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              hitSlop={4}
              onPress={() => {
                setQ("");
                setError(null);
              }}
              style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
            >
              <Icon ios="xmark.circle.fill" android="cancel" size={18} color={c.text3} />
            </Pressable>
          ) : null
        }
      />

      {busy ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <ActivityIndicator size="small" color={c.neoText} />
          <Text variant="bodySm" tone="2" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
            Finding {busy} on Compass
          </Text>
        </Animated.View>
      ) : (
        <Results
          title={text ? undefined : "Used on this phone"}
          options={options}
          message={!text ? null : options.length ? null : searching ? "Searching Compass" : empty}
          onPick={o => void pick(o)}
        />
      )}

      <View style={{ alignItems: "center" }}>
        <GlassChip
          label="Enter your school's Compass address instead"
          icon={<Icon ios="link" android="link" size={15} color={c.text2} weight="medium" />}
          onPress={() => onNeedAddress(null)}
        />
      </View>
    </View>
  );
}

/** The schools on offer, as rows in a card; or a line saying why there are none. */
function Results({
  title,
  options,
  message,
  onPick,
}: {
  title?: string;
  options: Option[];
  message: string | null;
  onPick: (o: Option) => void;
}) {
  if (message)
    return (
      <Animated.View key={message} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
        <Text variant="bodySm" tone="2" accessibilityLiveRegion="polite" style={{ paddingHorizontal: space[1] }}>
          {message}
        </Text>
      </Animated.View>
    );
  if (!options.length) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.duration(220)} style={{ gap: space[2] }}>
      {title && (
        <Text variant="overline" tone="2" accessibilityRole="header" style={{ paddingHorizontal: space[1] }}>
          {title}
        </Text>
      )}
      <Card padded={false}>
        {options.map((o, i) => (
          <Animated.View key={o.key} entering={FadeIn.duration(180)}>
            {i > 0 && <Rule inset={space[4] + 18 + space[3]} />}
            <Row
              onPress={() => onPick(o)}
              leading={<OptionIcon kind={o.kind} recent={!!title} />}
              title={
                o.kind === "address" ? (
                  <Text variant="mono" style={{ fontSize: 15 }} numberOfLines={1}>
                    {o.name}
                  </Text>
                ) : (
                  o.name
                )
              }
              caption={
                o.kind === "school" ? (
                  <Text variant="mono" tone="2" numberOfLines={1}>
                    {hostOf(o.slug)}
                  </Text>
                ) : undefined
              }
            />
          </Animated.View>
        ))}
      </Card>
    </Animated.View>
  );
}

/** A row's icon: a link for a typed address, a clock for a school this phone used, a cap for the rest. */
function OptionIcon({ kind, recent }: { kind: Option["kind"]; recent: boolean }) {
  const c = useTheme();
  const [ios, android] = (
    kind === "address" ? ["link", "link"] : recent ? ["clock.arrow.circlepath", "history"] : ["graduationcap.fill", "school"]
  ) satisfies [SFSymbol, AndroidSymbol];
  return <Icon ios={ios} android={android} size={18} color={c.text3} weight="medium" />;
}
