import { Fragment, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, Rule } from "@/components/ui/card";
import { GlassIconButton, Icon } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/notice";
import { Screen, Section } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { Arrive, Swap } from "@/features/grades/moving";
import { dayIn, dayName, zoneOf } from "@/lib/days";
import { useSession, type Me } from "@/lib/session";
import { useChecked, useSyncRefresh } from "@/lib/sync";
import { ago, useNow } from "@/lib/time";
import { useTheme } from "@/theme/theme";
import { classColor, space } from "@/theme/tokens";
import { assemblyTime, byDay, NOTICE_STEPS, NOTICES_HUE, upcomingAssemblies, useAnnouncements, type UpcomingAssembly } from "./data";
import { NoticeItem } from "./notice-item";

/**
 * The school's notices, a page of their own (pushed from home's notices row; the header says "Notices"), as the web's
 * notices page has them (apps/web/app/features/student/notices.tsx, framed by student-panel.tsx): when they were last
 * checked, the assemblies coming up that are for the student, then the notices day by day, newest first. The latest
 * day's notices are open, earlier ones shut to a title and a line, each opening in place. The sync brings them, so
 * pulling down (or the refresh by the status line) runs one, and the page counts as refreshing until the news step has
 * come back.
 *
 * The sections rise into place one after another as they first appear: rise, not a fade, since an open notice holds
 * glass (its Summary and Original switch). The status line's words give way to new ones in place.
 */
export function NoticesScreen() {
  const { me, token } = useSession();
  // Signing out clears the session a frame before the guard swaps this page for sign-in.
  if (!me || !token) return <Screen>{null}</Screen>;
  return <Notices me={me} token={token} />;
}

function Notices({ me, token }: { me: Me; token: string }) {
  const zone = zoneOf(me.slug);
  const now = useNow();
  const today = dayIn(zone, now);
  const data = useAnnouncements(token);
  const { refresh, refreshing } = useSyncRefresh(token, data?.fetchedAt, NOTICE_STEPS);
  const checked = useChecked(token, data?.fetchedAt, NOTICE_STEPS);
  const status = refreshing ? "Getting the latest" : checked ? `Updated ${ago(checked, now)}` : data === null ? "Not synced yet" : "";
  const run = () => {
    if (!refreshing) void refresh();
  };

  const content = (() => {
    if (data === undefined) return <Loading />;
    if (!data) return <NotYet refreshing={refreshing} onRefresh={run} />;
    const assemblies = upcomingAssemblies(data, today, now);
    const days = byDay(data.notices, zone);
    if (!days.length && !assemblies.length) return <Quiet />;
    return (
      <>
        {assemblies.length > 0 && (
          <Arrive glass>
            <Section title="Assemblies coming up">
              <Card padded={false}>
                {assemblies.map((a, i) => (
                  <Fragment key={`${a.date}:${a.id}`}>
                    {i > 0 && <Rule />}
                    <AssemblyRow a={a} today={today} zone={zone} />
                  </Fragment>
                ))}
              </Card>
            </Section>
          </Arrive>
        )}
        {days.map((d, i) => (
          <Arrive key={d.day} glass index={i + (assemblies.length > 0 ? 1 : 0)}>
            <Section title={dayName(d.day, today)}>
              <Card padded={false}>
                {d.notices.map((n, j) => (
                  <Fragment key={n.id}>
                    {j > 0 && <Rule />}
                    <NoticeItem notice={n} today={today} zone={zone} defaultOpen={i === 0} />
                  </Fragment>
                ))}
              </Card>
            </Section>
          </Arrive>
        ))}
      </>
    );
  })();

  return (
    <Screen refreshing={refreshing} onRefresh={run}>
      <Status text={status} refreshing={refreshing} onRefresh={run} />
      {content}
    </Screen>
  );
}

/**
 * When the notices were last checked, as the web panel's header says it, with a round glass refresh at its end for
 * anyone who can't or doesn't pull down (a screen reader among them). While a sync runs it spins in place, still whole
 * glass (never dimmed), and pressing it again does nothing.
 */
function Status({ text, refreshing, onRefresh }: { text: string; refreshing: boolean; onRefresh: () => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 34, paddingLeft: space[1], marginBottom: -space[1] }}>
      <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
        <Swap id={text}>
          <Text variant="caption" tone="3" numberOfLines={1}>
            {text}
          </Text>
        </Swap>
      </View>
      <GlassIconButton
        ios="arrow.clockwise"
        android="refresh"
        size={34}
        label={refreshing ? "Getting the latest notices" : "Refresh notices"}
        busy={refreshing}
        onPress={onRefresh}
      >
        {refreshing ? <ActivityIndicator size="small" color={c.text2} /> : undefined}
      </GlassIconButton>
    </View>
  );
}

/** An assembly coming up that is for the student: what, where and who for, then which day and when. */
function AssemblyRow({ a, today, zone }: { a: UpcomingAssembly; today: string; zone: string }) {
  const about = [a.place, a.audience, a.maybe ? "May not include you" : null].filter(Boolean).join(" · ");
  const day = dayName(a.date, today);
  const time = assemblyTime(a, zone);
  return (
    <View
      accessible
      accessibilityLabel={`${a.title}. ${day}, ${time}.${about ? ` ${about}.` : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], minHeight: 52 }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="label" tone={a.maybe ? "2" : "1"} numberOfLines={2}>
          {a.title}
        </Text>
        {!!about && (
          <Text variant="caption" tone="3" numberOfLines={2}>
            {about}
          </Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="caption" style={{ fontWeight: "600" }}>
          {day}
        </Text>
        <Text variant="caption" tone="3" style={{ fontVariant: ["tabular-nums"] }}>
          {time}
        </Text>
      </View>
    </View>
  );
}

/** Why there is nothing to read, in a card: the notices' glyph, a line, a sentence and maybe a way to fetch them. */
function Blank({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const c = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[3] }}>
        <View style={{ paddingTop: 2 }}>
          <Icon ios="newspaper.fill" android="newspaper" size={20} color={classColor(NOTICES_HUE, c).accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" style={{ fontWeight: "600" }}>
            {title}
          </Text>
          <Text variant="bodySm" tone="2">
            {body}
          </Text>
          {action != null && <View style={{ marginTop: space[2], alignSelf: "flex-start" }}>{action}</View>}
        </View>
      </View>
    </Card>
  );
}

/** Before the first sync has fetched the school's feed. */
function NotYet({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <Blank
      title="No notices yet"
      body="They come in with the next sync."
      action={
        <Button size="sm" variant="secondary" pending={refreshing} pendingLabel="Getting notices" onPress={onRefresh}>
          Get notices now
        </Button>
      }
    />
  );
}

/** The feed is in, and the school has posted nothing the student sees in the three weeks the server keeps. */
function Quiet() {
  return <Blank title="No notices lately" body="The school hasn't posted any in the last three weeks." />;
}

/** The page on its way: a section's label over a card of bars as tall as the rows coming, twice. */
function Loading() {
  return (
    <View accessible accessibilityLabel="Loading notices" style={{ gap: space[4] }}>
      {[
        [44, 44],
        [56, 40, 40],
      ].map((rows, i) => (
        <View key={i} style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: space[1], minHeight: 24, justifyContent: "center" }}>
            <Skeleton height={13} width={96} />
          </View>
          <Card panelStyle={{ gap: space[3] }}>
            {rows.map((h, j) => (
              <Skeleton key={j} height={h} />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}
