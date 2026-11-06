import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Card, Rule } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { dayIn, dayName } from "@/lib/days";
import { useSession } from "@/lib/session";
import { focusIn } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";
import { PlanText, SideNotes, SourceTag, StateChip, stateLabel } from "./bits";
import { SOURCE, type Assessment, type ClassWork, type WorkItem } from "./data";
import { FileRow } from "./file-row";
import { workFileKind, hostOf } from "./files";
import { Glyph, type GlyphName } from "./glyph";
import { RankPill } from "./grade-parts";
import { assessmentFor, pct, toneText } from "./grades";
import { HandIn, pinned, SendingChip, settleFlows, useFlow, useFlows } from "./hand-in";
import { Arrive, Block, Chevron, Divided, Fold, FoldBlock, Press, ROW, SkeletonBlock, useHue } from "./kit";
import { dueLong, dueShort, dueSoon, groupWork, keepInPlace, lastLessonLong, latest, stateOf, workItems, type WorkGroups } from "./work";

/**
 * Work: Compass's learning tasks, Connect's submissions and Canvas's assignments as one list, grouped by what they need
 * (overdue, to do, no date, handed in, earlier), each row opening in place to its whole, laid out as the web's work
 * page: when, the mark, the teacher's word, the instructions and attachments, what was handed in, and handing it in
 * (hand-in.tsx: a file, a photo or a link, straight to Compass or Connect). Canvas's open on Canvas. After the web's
 * work.tsx. Landing after the section (the class's work coming in), the groups rise into place down the page.
 */

type Group = keyof WorkGroups;

type Ctx = {
  token: string | null;
  code: string;
  zone: string;
  today: string;
  now: number;
  mixed: boolean;
  assessments: Assessment[];
  open: string | null;
  toggle: (key: string) => void;
};

export function WorkTab({ work, code, zone, today, now, assessments }: { work: ClassWork | null | undefined; code: string; zone: string; today: string; now: number; assessments: Assessment[] }) {
  const { token } = useSession();
  const flows = useFlows();
  const [open, setOpen] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState<boolean | null>(null);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [undatedOpen, setUndatedOpen] = useState<boolean | null>(null);
  // A pick never sent, a failure or a "Handed in" goes with the list; one still on its way lands when it lands.
  useEffect(() => () => settleFlows(code), [code]);
  if (work === undefined) return <SkeletonBlock rows={[40, 40, 40, 40]} />;
  if (!work) return null;
  const { items, mixed } = workItems(work);
  // Work just handed in stays where it was until the list is next opened, so it never leaves from under the finger.
  const g = keepInPlace(groupWork(items, now), pinned(flows));
  // One open at a time, so the list never turns into a wall of instructions.
  const ctx: Ctx = { token, code, zone, today, now, mixed, assessments, open, toggle: key => setOpen(o => (o === key ? null : key)) };
  const rows = (list: WorkItem[], group: Group) => (
    <Divided>
      {list.map(w => (
        <WorkRow key={w.key} item={w} group={group} ctx={ctx} />
      ))}
    </Divided>
  );
  // A side still on its way may have work in it: no "nothing set" until every side is in.
  const waiting = [work.compass, work.connect, work.canvas].some(s => s.status === "missing");
  const clear = !g.todo.length && !g.overdue.length && !g.undated.length;
  // Work with no date (Canvas has a lot) folds away, so it never pushes what is due down; open when it is all there is.
  const undatedShown = undatedOpen ?? (!g.todo.length && !g.overdue.length);
  const doneShown = doneOpen ?? clear;

  if (!items.length && waiting) return <SkeletonBlock rows={[40, 40, 40, 40]} />;
  return (
    <>
      {g.overdue.length > 0 && (
        <Block glyph="warning" title="Overdue">
          {rows(g.overdue, "overdue")}
        </Block>
      )}
      {g.todo.length > 0 && (
        <Block glyph="work" title="To do" index={1}>
          {rows(g.todo, "todo")}
        </Block>
      )}
      {g.undated.length > 0 && (
        <FoldBlock glyph="calendar" title="No due date" count={g.undated.length} open={undatedShown} onToggle={() => setUndatedOpen(!undatedShown)} index={2}>
          {rows(g.undated, "undated")}
        </FoldBlock>
      )}
      {clear && items.length > 0 && (
        <Arrive>
          <AllClear done={g.done.length > 0} />
        </Arrive>
      )}
      {g.done.length > 0 && (
        <FoldBlock glyph="check" title="Handed in" count={g.done.length} open={doneShown} onToggle={() => setDoneOpen(!doneShown)} index={3}>
          {rows(g.done, "done")}
        </FoldBlock>
      )}
      {g.earlier.length > 0 && (
        <FoldBlock glyph="clock" title="Earlier" count={g.earlier.length} open={earlierOpen} onToggle={() => setEarlierOpen(o => !o)} index={4}>
          {rows(g.earlier, "earlier")}
        </FoldBlock>
      )}
      {!items.length && !waiting && (
        <Arrive>
          <Nothing />
        </Arrive>
      )}
      <SideNotes
        sides={[
          ["compass", work.compass],
          ["connect", work.connect],
          ["canvas", work.canvas],
        ]}
        what={{ compass: "learning tasks", connect: "submissions", canvas: "assignments" }}
        now={now}
      />
    </>
  );
}

/** A class with nothing set at all, as the web says it: a quiet glyph and a line, centred. */
function Nothing() {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space[2], paddingVertical: space[10] }}>
      <Glyph name="work" size={30} color={c.text3} />
      <Text variant="label" tone="2">
        Nothing set for this class
      </Text>
    </View>
  );
}

function AllClear({ done }: { done: boolean }) {
  const c = useTheme();
  return (
    <Card panelStyle={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] }}>
      <Glyph name="check" size={20} color={c.okText} />
      <Text variant="label" style={{ flex: 1 }}>
        {done ? "Nothing to do. Everything is handed in." : "Nothing to do right now."}
      </Text>
    </Card>
  );
}

/**
 * A piece of work as a row, as the web's list draws one: its name, when it is due (or went in), its mark if it has
 * one, and where it stands ("Handing in" while a hand-in is on its way; a new standing comes into focus in its place).
 * Pressed, it washes grey and opens in place.
 */
function WorkRow({ item, group, ctx }: { item: WorkItem; group: Group; ctx: Ctx }) {
  const c = useTheme();
  const flow = useFlow(item.key);
  const { zone, today, now } = ctx;
  const s = stateOf(item, now);
  const sending = flow?.phase === "sending";
  const graded = assessmentFor(item.name, ctx.assessments);
  const handed = (s === "submitted" || s === "late") && item.handedIn.length > 0;
  const at = handed ? latest(item.handedIn) : null;
  const meta = [
    handed ? (at ? `Handed in ${dayName(dayIn(zone, at), today)}` : `${item.handedIn.length} handed in`) : dueShort(item.due, zone, today, now),
    item.result && `Result ${item.result}`,
    item.feedback && "Feedback",
  ]
    .filter(Boolean)
    .join(" · ");
  const soon = dueSoon(item, zone, today, now);
  const open = ctx.open === item.key;
  return (
    <View>
      <Press
        onPress={() => ctx.toggle(item.key)}
        label={`${item.name}, ${sending ? "Handing in" : stateLabel(s)}, ${meta}${ctx.mixed ? `, from ${SOURCE[item.source]}` : ""}`}
        hint={open ? "Hides the details" : "Shows the details"}
        state={{ expanded: open }}
      >
        {({ pressed }) => (
          <View style={[ROW, { flexDirection: "row", alignItems: "center", gap: space[3] }, pressed && { backgroundColor: c.lineFaint }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" numberOfLines={open ? undefined : 1}>
                {item.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
                <Text variant="caption" color={soon ? c.warnText : c.text3} numberOfLines={1} style={{ flexShrink: 1, fontVariant: ["tabular-nums"] }}>
                  {meta}
                </Text>
                {ctx.mixed && <SourceTag source={item.source} />}
              </View>
              {graded && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: 2 }}>
                  <Text variant="caption" color={toneText(graded.percent, c)} style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                    {pct(graded.percent)}%
                  </Text>
                  <RankPill mark={graded.percent} spread={graded.spread} />
                </View>
              )}
            </View>
            <Animated.View key={sending ? "sending" : s} entering={focusIn()}>
              {sending ? <SendingChip /> : <StateChip state={s} />}
            </Animated.View>
            <Chevron open={open} />
          </View>
        )}
      </Press>
      <Fold open={open}>
        <WorkDetail item={item} group={group} ctx={ctx} />
      </Fold>
    </View>
  );
}

/**
 * One part of the opened work, as the web's detail lays each out in a block of its own: a hairline over it, then a
 * glyph in the class's colour and a short title. `flush` leaves the content to bring its own padding (file rows).
 */
function Section({ glyph, title, children, flush }: { glyph: GlyphName; title: string; children: ReactNode; flush?: boolean }) {
  const hue = useHue();
  return (
    <View>
      <Rule inset={space[4]} />
      <View style={{ paddingTop: space[3], paddingBottom: flush ? 0 : space[3], gap: flush ? 0 : space[2] }}>
        <View accessible accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", gap: space[1.5], paddingHorizontal: space[4] }}>
          <Glyph name={glyph} size={13} color={hue.accent} />
          <Text variant="overline" tone="2">
            {title}
          </Text>
        </View>
        {flush ? children : <View style={{ paddingHorizontal: space[4] }}>{children}</View>}
      </View>
    </View>
  );
}

/** One piece of work, opened: when, the mark, the teacher's word, the instructions, the files, and handing it in. */
function WorkDetail({ item, group, ctx }: { item: WorkItem; group: Group; ctx: Ctx }) {
  const c = useTheme();
  const hue = useHue();
  const { zone, today, now } = ctx;
  const s = stateOf(item, now);
  const graded = assessmentFor(item.name, ctx.assessments);
  const last = (s === "todo" || s === "none") && lastLessonLong(item.lastLesson, today, zone);
  return (
    <View style={{ paddingBottom: space[1] }}>
      <View style={{ paddingHorizontal: space[4], gap: space[1.5], paddingBottom: space[3] }}>
        <Line glyph="calendar" color={hue.accent} text={dueLong(item.due, zone, today, now)} />
        {last && <Line glyph="clock" color={c.text3} text={last} />}
        {item.stateText && <Line glyph="info" color={c.text3} text={item.stateText} />}
      </View>

      {graded && (
        <Section glyph="grade" title="Marked">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
            <Text variant="heading" color={toneText(graded.percent, c)} style={{ fontVariant: ["tabular-nums"] }}>
              {pct(graded.percent)}%
            </Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="caption" tone="2" style={{ fontVariant: ["tabular-nums"] }}>
                {graded.mark}/{graded.max}
                {graded.share != null ? ` · ${pct(Math.round(graded.share * 10) / 10)}% of grade` : ""}
              </Text>
              <RankPill mark={graded.percent} spread={graded.spread} />
            </View>
          </View>
        </Section>
      )}

      {(item.result || item.feedback) && (
        <Section glyph="teacher" title="From your teacher">
          <View style={{ gap: space[1] }}>
            {item.result && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
                <Text variant="bodySm" tone="2" style={{ flex: 1 }}>
                  Result
                </Text>
                <Text variant="label" style={{ fontVariant: ["tabular-nums"] }}>
                  {item.result}
                </Text>
              </View>
            )}
            {item.feedback && (
              <Text variant="bodySm" tone="2">
                Your teacher left feedback on this. It is on {SOURCE[item.source]}.
              </Text>
            )}
          </View>
        </Section>
      )}

      {item.instructions.length > 0 && (
        <Section glyph="plan" title="Instructions">
          <PlanText blocks={item.instructions} />
        </Section>
      )}

      {item.attachments.length > 0 && (
        <Section glyph="attachment" title="Attachments" flush>
          <Divided inset={space[4]}>
            {item.attachments.map((f, i) => {
              const kind = workFileKind(f);
              return <FileRow key={`${f.name}-${i}`} name={f.name} href={f.href} external={f.external} kind={kind} meta={f.external ? (hostOf(f.href) ?? kind.label) : kind.label} />;
            })}
          </Divided>
        </Section>
      )}

      {item.handedIn.length > 0 && (
        <Section glyph="check" title="What you handed in" flush>
          <Divided inset={space[4]}>
            {item.handedIn.map((f, i) => {
              const kind = workFileKind(f);
              const meta = [f.external ? hostOf(f.href) : kind.label, f.at && `Handed in ${dayName(dayIn(zone, f.at), today)}`].filter(Boolean).join(" · ");
              return <FileRow key={`${f.name}-${i}`} name={f.name} href={f.href} external={f.external} kind={kind} meta={meta} />;
            })}
          </Divided>
        </Section>
      )}

      <Section glyph="upload" title={item.canSubmit && item.handedIn.length ? "Hand in again" : "Hand in"}>
        <HandIn item={item} token={ctx.token} code={ctx.code} group={group} />
      </Section>
    </View>
  );
}

function Line({ glyph, color, text }: { glyph: GlyphName; color: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
      <Glyph name={glyph} size={13} color={color} style={{ marginTop: 2 }} />
      <Text variant="caption" tone="2" style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
        {text}
      </Text>
    </View>
  );
}
