import { useMemo } from "react";
import { View } from "react-native";
import { router, Stack } from "expo-router";
import { space } from "@/theme/tokens";
import { useSession } from "@/lib/session";
import { useSyncRefresh } from "@/lib/sync";
import { dayIn, zoneOf } from "@/lib/days";
import { useNow } from "@/lib/time";
import { Screen, Section } from "@/components/ui/screen";
import { Card, Rule } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { tabular } from "@/features/grades/data";
import { SyncGauge } from "@/features/sync/sync-gauge";
import { AllCaughtUp, TodoRow, TodoRowsSkeleton } from "./todo-row";
import { freshen, sectionsOf, useTodo, type TodoSection } from "./data";

/**
 * To do, a page pushed from home's to-do section: every piece of work not handed in yet, from Compass, Connect and
 * Canvas, in the web's order (every overdue piece first, then by when it is due), with a small heading and a card of
 * dense rows for each stretch. It sits straight under the native header (its title is the layout's; the sync gauge
 * sits at its end). Pulling down runs a sync and spins until it has finished.
 */
export function TodoScreen() {
  const { me, token } = useSession();
  const now = useNow(60_000);
  const zone = zoneOf(me?.slug ?? "");
  const today = dayIn(zone, now);
  const todo = useTodo(token);
  const { refresh, refreshing } = useSyncRefresh(token);
  // Kept the same object between renders: the header is set again whenever its options change. Bare: on iOS 26 the
  // header draws its own glass platter behind it.
  const header = useMemo(() => ({ headerRight: token ? () => <SyncGauge token={token} glass={false} /> : undefined }), [token]);

  const sections = todo?.synced ? sectionsOf(freshen(todo.items, now), today, zone) : null;
  const open = (code: string) => router.push({ pathname: "/class/[code]", params: { code, tab: "work" } });

  return (
    <>
      <Stack.Screen options={header} />
      <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
        {!sections ? (
          <TodoSkeleton waiting={!!todo && !todo.synced} />
        ) : !sections.length ? (
          <AllCaughtUp />
        ) : (
          sections.map(s => <Group key={s.key} section={s} zone={zone} today={today} onOpen={open} />)
        )}
      </Screen>
    </>
  );
}

/** One stretch of the list: its heading and count (overdue's in amber), and its work in one card. */
function Group({ section, zone, today, onOpen }: { section: TodoSection; zone: string; today: string; onOpen: (code: string) => void }) {
  const n = section.data.length;
  return (
    <Section
      title={section.title}
      right={
        <Text
          variant="caption"
          tone={section.key === "overdue" ? "warn" : "3"}
          style={[tabular, { fontWeight: "600" }]}
          accessibilityLabel={`${n} ${n === 1 ? "piece" : "pieces"} of work`}
        >
          {n}
        </Text>
      }
    >
      <Card padded={false}>
        {section.data.map((item, i) => (
          <View key={item.key}>
            {i > 0 && <Rule />}
            <TodoRow item={item} zone={zone} today={today} onOpen={onOpen} index={i} />
          </View>
        ))}
      </Card>
    </Section>
  );
}

/** The list on its way: a heading and a few rows the height they will have. Before the first sync, it says so. */
function TodoSkeleton({ waiting }: { waiting: boolean }) {
  return (
    <View accessible accessibilityLabel={waiting ? "Getting your work from Compass" : "Loading your work"} style={{ gap: space[2] }}>
      {waiting && (
        <Text variant="caption" tone="2" style={{ textAlign: "center", marginBottom: space[2] }}>
          Getting your work from Compass
        </Text>
      )}
      <View style={{ paddingHorizontal: space[1], minHeight: 24, justifyContent: "center" }}>
        <Skeleton height={12} width={72} />
      </View>
      <TodoRowsSkeleton rows={4} />
    </View>
  );
}
