import { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated from "react-native-reanimated";
import { Rule } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Text } from "@/components/ui/text";
import { ago } from "@/lib/time";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { KindGlyph, PlanText, SideNotes, SourceTag } from "./bits";
import { SOURCE, usePageAction, type ClassResources, type PlanBlock, type ResourceNode, type ResourceSide, type Source } from "./data";
import { FileRow } from "./file-row";
import { buildLibrary, groupsOf, kindOfNode, lineOf, mixedSources, searchLibrary, titleOf, type Leaf, type Library } from "./files";
import { Glyph } from "./glyph";
import { Block, Chevron, Divided, Fold, FoldBlock, FootChip, Press, ROW, SkeletonBlock, useHue } from "./kit";

/**
 * Files: the class's library as rows in cards. What is new leads (Connect dates its content; Compass does not),
 * then the class's folders, each opening in place to what it holds with the folders inside as small headings, then
 * Compass's folder of lesson plans, shut. A search finds anything by its name or its folder's. Every file and link
 * opens in the in-app browser; a Compass page opens in place to its text. After the web's files.tsx. Landing after the
 * section (the class's files coming in), the cards rise into place down the page.
 */

const PLANS_SHOWN = 15;

type Ctx = { token: string; mixed: boolean };

export function FilesTab({ data, refreshing, token, today, now }: { data: ClassResources | null | undefined; refreshing: boolean; token: string; today: string; now: number }) {
  const c = useTheme();
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState<Set<string> | null>(null);
  if (data === null) return null;
  const lib = buildLibrary(data, today, now);
  const sides: [Source, ResourceSide][] = data
    ? [
        ["compass", data.compass],
        ["connect", data.connect],
        ["canvas", data.canvas],
      ]
    : [];
  const ready = sides.filter(([, s]) => s.status === "ready");
  const waiting = !data || (!ready.length && sides.some(([, s]) => s.status === "missing"));
  const total = lib.leaves.length;
  const ctx: Ctx = { token, mixed: lib.mixed };
  // A class with a single folder has it open; more start shut.
  const open = opened ?? new Set(lib.roots.length === 1 ? [lib.roots[0]!.key] : []);
  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpened(next);
  };
  const updated = ready.length ? Math.max(...ready.map(([, s]) => (s.status === "ready" ? s.fetchedAt : 0))) : null;
  const notes = <SideNotes sides={sides} what={{ compass: "resources", connect: "learning content", canvas: "files" }} now={now} />;

  const search = (
    <View style={{ gap: space[1.5] }}>
      <Field
        value={q}
        onChangeText={setQ}
        placeholder={total ? `Search ${total} ${total === 1 ? "item" : "items"}` : "Search files"}
        accessibilityLabel="Search files"
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        editable={total > 0 || lib.plans.length > 0}
      />
      {(updated || refreshing) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], paddingHorizontal: space[2] }}>
          {refreshing && <ActivityIndicator size="small" color={c.text3} />}
          <Text variant="caption" tone="3">
            {refreshing ? "Checking for new files" : `Updated ${ago(updated!, now)}. Pull to refresh.`}
          </Text>
        </View>
      )}
    </View>
  );

  if (waiting)
    return (
      <>
        {search}
        <SkeletonBlock rows={[40, 40, 40, 40, 40]} />
      </>
    );

  if (!total && !lib.plans.length)
    return (
      <>
        {search}
        {notes}
        {sides.every(([, s]) => s.status === "ready" || s.status === "none") && (
          <View style={{ alignItems: "center", gap: space[2], paddingVertical: space[10] }}>
            <Glyph name="files" size={30} color={c.text3} />
            <Text variant="label" tone="2">
              No resources for this class yet
            </Text>
          </View>
        )}
      </>
    );

  const hits = q.trim() ? searchLibrary(lib, q) : null;
  return (
    <>
      {search}
      {notes}
      {hits ? (
        hits.length ? (
          <Block glyph="search" title={`${hits.length} ${hits.length === 1 ? "result" : "results"}`}>
            <Rows leaves={hits} ctx={ctx} how="where" />
          </Block>
        ) : (
          <View style={{ alignItems: "center", gap: space[2], paddingVertical: space[8] }} accessibilityLiveRegion="polite">
            <Glyph name="search" size={24} color={c.text3} />
            <Text variant="label" tone="2">
              Nothing called “{q.trim()}”
            </Text>
          </View>
        )
      ) : (
        <>
          {lib.fresh.length > 0 && (
            <Block glyph="sparkle" title="New">
              <Rows leaves={lib.fresh} ctx={ctx} how="where" />
            </Block>
          )}
          {lib.roots.length > 0 && (
            <Block glyph="folder" title="Folders" index={1}>
              <Divided>
                {lib.roots.map(f => (
                  <FolderRow key={f.key} node={f} lib={lib} ctx={ctx} open={open.has(f.key)} onToggle={() => toggle(f.key)} />
                ))}
              </Divided>
            </Block>
          )}
          {lib.plans.length > 0 && <PlansBlock lib={lib} ctx={ctx} index={2} />}
        </>
      )}
    </>
  );
}

/** Things as rows. Where they come from more than one side, each says which. */
function Rows({ leaves, ctx, how, inset = 0 }: { leaves: Leaf[]; ctx: Ctx; how: "where" | "what"; inset?: number }) {
  const marks = ctx.mixed && mixedSources(leaves);
  return (
    <Divided inset={inset + space[4]}>
      {leaves.map(l => {
        const n = l.node;
        const mark = marks ? <SourceTag source={n.source} /> : undefined;
        // A Compass page opens in place; a Canvas page (nothing to read here) opens on Canvas.
        if (n.kind === "page" && n.source !== "canvas" && n.page) return <PageItem key={n.key} node={n} title={n.name} meta={lineOf(l, how)} token={ctx.token} inset={inset} />;
        return <FileRow key={n.key} name={titleOf(n)} href={n.href} external={n.external} kind={kindOfNode(n)} meta={lineOf(l, how)} aside={mark} inset={inset} />;
      })}
    </Divided>
  );
}

/** A folder's row: it opens in place to what it holds, the folders inside it as small headings over their own rows. */
function FolderRow({ node, lib, ctx, open, onToggle }: { node: ResourceNode; lib: Library; ctx: Ctx; open: boolean; onToggle: () => void }) {
  const c = useTheme();
  const hue = useHue();
  const count = lib.counts.get(node.key) ?? 0;
  return (
    <View>
      <Press onPress={onToggle} label={`${node.name}, ${count} ${count === 1 ? "item" : "items"}${ctx.mixed ? `, from ${SOURCE[node.source]}` : ""}`} state={{ expanded: open }}>
        {({ pressed }) => (
          <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3] }, pressed && { backgroundColor: c.lineFaint }]}>
            <Glyph name={open ? "folderOpen" : "folderShut"} size={20} color={hue.accent} />
            <Text variant="label" numberOfLines={2} style={{ flex: 1 }}>
              {node.name}
            </Text>
            {ctx.mixed && <SourceTag source={node.source} />}
            <Text variant="label" tone="3" style={{ minWidth: 22, textAlign: "right", fontVariant: ["tabular-nums"] }}>
              {count}
            </Text>
            <Chevron open={open} />
          </View>
        )}
      </Press>
      <Fold open={open}>
        <View style={{ paddingBottom: space[2] }}>
          {groupsOf(node).map(g => (
            <View key={g.key}>
              {g.path.length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], paddingLeft: space[10], paddingRight: space[4], paddingTop: space[3], paddingBottom: space[1] }}>
                  <Glyph name="folder" size={13} color={c.text3} />
                  <Text variant="caption" tone="2" numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
                    {g.path.join(" › ")}
                  </Text>
                </View>
              )}
              <Rows leaves={g.leaves} ctx={ctx} how="what" inset={space[6]} />
            </View>
          ))}
        </View>
      </Fold>
    </View>
  );
}

/** Compass's lesson plans, folded: most are empty pages, so they never lead. */
function PlansBlock({ lib, ctx, index }: { lib: Library; ctx: Ctx; index: number }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PLANS_SHOWN);
  const more = Math.min(30, lib.plans.length - shown);
  return (
    <FoldBlock glyph="page" title="Lesson plans" count={lib.plans.length} open={open} onToggle={() => setOpen(o => !o)} index={index}>
      <Divided>
        {lib.plans.slice(0, shown).map(p => (
          <PageItem key={p.node.key} node={p.node} title={p.label} meta={p.node.by ?? "Lesson plan"} token={ctx.token} />
        ))}
      </Divided>
      {more > 0 && (
        <>
          <Rule />
          <FootChip label={`Show ${more} more`} onPress={() => setShown(s => s + 30)} />
        </>
      )}
    </FoldBlock>
  );
}

/** Pages fetched this session, by asset, so opening one again shows it at once. */
const pageText = new Map<string, PlanBlock[]>();

/**
 * A Compass page as a row that opens to its text, fetched the first time it opens: the text comes into focus where the
 * "Opening the page" line was (a page already fetched is simply there as the row opens).
 */
function PageItem({ node, title, meta, token, inset = 0 }: { node: ResourceNode; title: string; meta: string; token: string; inset?: number }) {
  const c = useTheme();
  const load = usePageAction();
  const id = node.page?.fileAssetId ?? node.key;
  const [blocks, setBlocks] = useState<PlanBlock[] | "failed" | null>(() => pageText.get(id) ?? null);
  const [open, setOpen] = useState(false);
  const asking = useRef(false);
  const ask = () => {
    const p = node.page;
    if (!p || asking.current || pageText.has(id)) return;
    asking.current = true;
    setBlocks(null);
    load({ token, fileAssetId: p.fileAssetId, nodeId: p.nodeId })
      .then(
        r => {
          if (r.ok) {
            pageText.set(id, r.blocks);
            setBlocks(r.blocks);
          } else setBlocks("failed");
        },
        () => setBlocks("failed"),
      )
      .finally(() => (asking.current = false));
  };
  const toggle = () => {
    if (!open && (blocks == null || blocks === "failed")) ask();
    setOpen(o => !o);
  };
  return (
    <View>
      <Press onPress={toggle} label={`${title}, ${meta}`} state={{ expanded: open }}>
        {({ pressed }) => (
          <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: space[4] + inset }, pressed && { backgroundColor: c.lineFaint }]}>
            <View style={{ width: 24, alignItems: "center" }}>
              <KindGlyph kind={kindOfNode(node)} size={20} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" numberOfLines={2}>
                {title}
              </Text>
              <Text variant="caption" tone="3" numberOfLines={1}>
                {meta}
              </Text>
            </View>
            <Chevron open={open} />
          </View>
        )}
      </Press>
      <Fold open={open}>
        <View style={{ paddingLeft: space[4] + inset + 36, paddingRight: space[4], paddingBottom: space[4] }}>
          {blocks === null ? (
            <View accessibilityRole="progressbar" style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <ActivityIndicator size="small" color={c.neoText} />
              <Text variant="bodySm" tone="2">
                Opening the page
              </Text>
            </View>
          ) : blocks === "failed" ? (
            <Text variant="bodySm" tone="2">
              Compass did not send this page. Close it and open it again to retry.
            </Text>
          ) : blocks.length ? (
            <Animated.View entering={focusIn()}>
              <PlanText blocks={blocks} />
            </Animated.View>
          ) : (
            <Text variant="bodySm" tone="3">
              Nothing written on this page.
            </Text>
          )}
        </View>
      </Fold>
    </View>
  );
}
