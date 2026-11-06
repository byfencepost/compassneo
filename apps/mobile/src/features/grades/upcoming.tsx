import { useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { glide } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { classColor } from "@/theme/tokens";
import { dayIn, dayName } from "@/lib/days";
import { Card, Rule } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Chevron, Fold } from "@/components/ui/fold";
import { GlassChip } from "@/components/ui/glass";
import { Text } from "@/components/ui/text";
import { ListRow } from "./list-row";
import { SubjectGlyph } from "./subject-glyph";
import { pct, tabular, type UpcomingAssessment } from "./data";

/** Rows shown before the rest fold away: the next few to hand in. */
const SHOWN = 4;

/**
 * What still counts towards this semester and has no mark, as the web's Grades page lists it: the work still to hand
 * in first, soonest due first, then work handed in and waiting for its mark. Each with its subject's glyph, its share
 * of the grade and when it is due (or "Handed in"); each opens its class's grades. The server sends up to two dozen,
 * so past the first few the rest fold away, and a small glass chip in the card's foot says how many and opens them.
 * The first few come into focus one after another as they first appear, and glide when the list changes under them;
 * the rest open plainly with their Fold.
 */
export function Upcoming({ items, zone, today, onOpen }: { items: UpcomingAssessment[]; zone: string; today: string; onOpen: (code: string) => void }) {
  const c = useTheme();
  const [all, setAll] = useState(false);
  const head = items.slice(0, SHOWN);
  const rest = items.slice(SHOWN);
  const row = (u: UpcomingAssessment, i: number, arrive?: number) => (
    <Animated.View key={u.key} layout={arrive != null ? glide : undefined}>
      {i > 0 && <Rule />}
      <UpcomingRow u={u} zone={zone} today={today} onOpen={onOpen} arrive={arrive} />
    </Animated.View>
  );
  return (
    <Card
      padded={false}
      foot={
        rest.length > 0 ? (
          <GlassChip
            size="sm"
            label={all ? "Show fewer" : `Show ${rest.length} more`}
            icon={<Chevron open={all} size={10} color={c.text2} />}
            expanded={all}
            onPress={() => setAll(a => !a)}
          />
        ) : undefined
      }
    >
      {head.map((u, i) => row(u, i, i))}
      {rest.length > 0 && <Fold open={all}>{rest.map((u, i) => row(u, i + 1))}</Fold>}
    </Card>
  );
}

function UpcomingRow({
  u,
  zone,
  today,
  onOpen,
  arrive,
}: {
  u: UpcomingAssessment;
  zone: string;
  today: string;
  onOpen: (code: string) => void;
  arrive?: number;
}) {
  const c = useTheme();
  const color = u.hue != null ? classColor(u.hue, c).accent : c.text2;
  const notes = [u.name, u.share != null && `${pct(u.share)}% of grade`].filter(Boolean).join(" · ");
  const when = u.handedIn ? null : u.due ? `Due ${dayName(dayIn(zone, u.due), today)}` : null;
  const code = u.code;
  return (
    <ListRow
      dense
      chevron={false}
      arrive={arrive}
      label={[u.task, notes, u.handedIn ? "Handed in, waiting for its mark" : when].filter(Boolean).join(". ")}
      hint={code ? "Opens this class's grades" : undefined}
      onPress={code ? () => onOpen(code) : undefined}
    >
      <SubjectGlyph names={[u.name, u.code]} color={color} size={14} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {u.task}
        </Text>
        <Text variant="caption" tone="3" numberOfLines={1} style={tabular}>
          {notes}
        </Text>
      </View>
      {u.handedIn ? (
        // The chip sits at its own start; a box of its own keeps it on the row's middle.
        <View>
          <Chip tone="ok">Handed in</Chip>
        </View>
      ) : when ? (
        <Text variant="caption" tone="2" numberOfLines={1} style={tabular}>
          {when}
        </Text>
      ) : null}
    </ListRow>
  );
}
