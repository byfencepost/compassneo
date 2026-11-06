import { useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, ActionSheetIOS, ActivityIndicator, Alert, Linking, Platform, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Animated, { LayoutAnimationConfig, withSpring, withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { GlassGroup, Icon } from "@/components/ui/glass";
import { Notice } from "@/components/ui/notice";
import { Text } from "@/components/ui/text";
import { MAX_UPLOAD, sizeOf, useHandIn, type PickedFile } from "@/lib/work";
import { focusIn, springs, timing } from "@/theme/motion";
import { useTheme } from "@/theme/theme";
import { day, radius, space } from "@/theme/tokens";
import { KindGlyph, Meter, Pill, useOpen } from "./bits";
import { SOURCE, type WorkItem } from "./data";
import { fileKind, hostOf, linkKind, sizeText } from "./files";
import { Glyph, type GlyphName } from "./glyph";
import { Arrive } from "./kit";
import type { WorkGroups } from "./work";

/**
 * Handing work in from the phone, after the web's HandIn (apps/web/app/features/class/work.tsx): on each slot a piece
 * of work goes in on, a file from the phone's files, a photo (taken there and then, for work done on paper, or from the
 * library), or on a Compass slot that takes one, a link. Handing in writes to the school's system, so it always asks
 * first, naming the file and where it goes, then shows it going (the upload's progress, then Compass or Connect taking
 * it) and lands on a plain "Handed in". Turnitin slots, and work the school will not take here, say why instead.
 *
 * Each step takes the last one's place as it comes (never as the row opens: then it is simply there): the picker and the
 * question, which hold glass buttons, rise into place; the progress, which holds none, comes into focus; and "Handed in"
 * lands with its check popping in on the snap spring.
 */

type Group = keyof WorkGroups;

export type HandInPick = { kind: "file"; file: PickedFile; photo: boolean } | { kind: "link"; url: string };

type Flow = { code: string; slotId: number; pick: HandInPick; group: Group } & (
  | { phase: "confirm" }
  | { phase: "sending" }
  | { phase: "done" }
  | { phase: "failed"; message: string }
);

// ---------- where each hand-in got to ----------

/**
 * Each piece of work's hand-in, by its key, kept outside the screen (the web keeps it above the class panel's
 * sections), so shutting the row, or going to another tab, while a file is on its way never loses where it got to.
 * The upload's progress is kept apart, so its many ticks redraw only what shows it.
 */
let flows: Readonly<Record<string, Flow>> = {};
let progress: Readonly<Record<string, number>> = {};
const listeners = new Set<() => void>();
const progressListeners = new Set<() => void>();

function setFlow(key: string, flow: Flow | null) {
  const next = { ...flows };
  if (flow) next[key] = flow;
  else delete next[key];
  flows = next;
  if (flow?.phase !== "sending" && key in progress) {
    const rest = { ...progress };
    delete rest[key];
    progress = rest;
    progressListeners.forEach(l => l());
  }
  listeners.forEach(l => l());
}

function setProgress(key: string, share: number) {
  if (flows[key]?.phase !== "sending") return;
  progress = { ...progress, [key]: share };
  progressListeners.forEach(l => l());
}

const follow = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const followProgress = (l: () => void) => {
  progressListeners.add(l);
  return () => void progressListeners.delete(l);
};

/** Every hand-in in hand, by the work's key. */
export const useFlows = () => useSyncExternalStore(follow, () => flows);

/** One piece of work's hand-in, if it has one going. */
export const useFlow = (key: string): Flow | undefined => useSyncExternalStore(follow, () => flows[key]);

const useSending = () => useSyncExternalStore(follow, () => Object.values(flows).some(f => f.phase === "sending"));
const useProgress = (key: string): number | undefined => useSyncExternalStore(followProgress, () => progress[key]);

/**
 * The class's work just handed in, by the group it was in when it went: it stays where it was (with its "Handed in")
 * instead of jumping into the handed-in list the moment the work reloads, until the work is next opened.
 */
export function pinned(all: Readonly<Record<string, Flow>>): Record<string, Group> {
  const out: Record<string, Group> = {};
  for (const [key, f] of Object.entries(all)) if (f.phase === "done") out[key] = f.group;
  return out;
}

/**
 * Lets the class's settled hand-ins go (a file picked and never sent, a failure, a "Handed in"): for when its work
 * leaves the screen, so a pick never waits around for days. One still on its way stays, to land when it lands.
 */
export function settleFlows(code: string) {
  for (const [key, f] of Object.entries(flows)) if (f.code === code && f.phase !== "sending") setFlow(key, null);
}

/** "Handing in", where a piece of work's state would show, while its hand-in is on its way. */
export function SendingChip() {
  return <Pill label="Handing in" glyph="pending" tone="neo" />;
}

// ---------- picking ----------

const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", gif: "image/gif" };
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif", "image/webp": "webp", "image/gif": "gif" };
const extOf = (s: string | null | undefined) => /\.([a-z0-9]{1,5})(?:[?#]|$)/i.exec(s ?? "")?.[1]?.toLowerCase() ?? null;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A photo's name: the library's own ("IMG_2041.jpg"), or for a photo just taken (or one whose name is only a device's
 * id), when it was taken ("Photo 2026-11-06 15.42.jpg"). The extension is the file's as written (the picker turns
 * HEIC into JPEG), so Compass and the teacher's computer open it.
 */
function photoName(a: ImagePicker.ImagePickerAsset, from: "camera" | "library") {
  const ext = extOf(a.uri) ?? (a.mimeType ? MIME_EXT[a.mimeType] : undefined) ?? extOf(a.fileName) ?? "jpg";
  const stem = a.fileName?.replace(/\.[^.]+$/, "") ?? "";
  const d = new Date();
  const taken = `Photo ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  return `${from === "library" && stem && !/^[0-9a-f-]{20,}$/i.test(stem) ? stem : taken}.${ext}`;
}

/** Any one file, from the Files app (iOS) or the system's file picker (Android), copied where it can be read. */
async function pickFile(): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  const a = r.canceled ? null : r.assets[0];
  if (!a) return null;
  const file: PickedFile = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? null, size: a.size ?? null };
  return { ...file, size: sizeOf(file) };
}

/**
 * A photo, taken there and then or from the library, as a JPEG (quality 0.8 keeps a page sharp and well under 40 MB).
 * The camera asks for permission first; the library needs none. "denied" when the camera was refused.
 */
async function pickPhoto(from: "camera" | "library"): Promise<PickedFile | "denied" | null> {
  if (from === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return "denied";
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.8,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const r = from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const a = r.canceled ? null : r.assets[0];
  if (!a) return null;
  const name = photoName(a, from);
  const file: PickedFile = { uri: a.uri, name, mimeType: EXT_MIME[extOf(name) ?? ""] ?? a.mimeType ?? "image/jpeg", size: a.fileSize ?? null };
  return { ...file, size: sizeOf(file) };
}

/** Where the photo comes from: iOS's action sheet, Android's dialog; a browser has only the library. */
function askPhotoSource(dark: boolean): Promise<"camera" | "library" | null> {
  if (Platform.OS === "web") return Promise.resolve("library");
  return new Promise(resolve => {
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Take a photo", "Choose from photos", "Cancel"], cancelButtonIndex: 2, userInterfaceStyle: dark ? "dark" : "light" },
        i => resolve(i === 0 ? "camera" : i === 1 ? "library" : null),
      );
    else
      Alert.alert(
        "Hand in a photo",
        undefined,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
          { text: "From photos", onPress: () => resolve("library") },
          { text: "Take a photo", onPress: () => resolve("camera") },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
  });
}

// ---------- the section ----------

/**
 * Where a piece of work is handed in. Canvas's work opens on Canvas; Compass's and Connect's take a file, a photo or
 * (where the slot does) a link, on each of their slots. Work that cannot be handed in here says why.
 */
export function HandIn({ item, token, code, group }: { item: WorkItem; token: string | null; code: string; group: Group }) {
  const c = useTheme();
  const open = useOpen();
  const flow = useFlow(item.key);
  const { handIn } = useHandIn(token, code);

  // Handed in on its own site (Canvas): a way there, never a hand-in here.
  if (item.url && !item.canSubmit) {
    const none = item.state === "none";
    return (
      <View style={{ gap: space[3], alignItems: "flex-start" }}>
        <Note glyph={none ? "lock" : "info"} text={none ? (item.why ?? "This is not handed in online.") : `This is handed in on ${SOURCE[item.source]}.`} />
        <Button
          variant="secondary"
          size="sm"
          icon={<Glyph name="external" size={13} color={c.text1} />}
          onPress={() => open(item.url!)}
          accessibilityLabel={`${none ? "View" : "Open"} ${item.name} in ${SOURCE[item.source]}`}
        >
          {`${none ? "View" : "Open"} in ${SOURCE[item.source]}`}
        </Button>
      </View>
    );
  }
  if (!item.canSubmit && flow?.phase !== "done") return <Note glyph="lock" text={item.why ?? `${SOURCE[item.source]} does not take work for this here.`} />;

  const many = item.slots.length > 1;
  return (
    <View style={{ gap: space[4] }}>
      {item.slots.map(slot => (
        <View key={slot.id} style={{ gap: space[2] }}>
          {many && (
            <Text variant="label" tone="2" numberOfLines={2}>
              {slot.name}
            </Text>
          )}
          <Slot item={item} slot={slot} flow={flow?.slotId === slot.id ? flow : undefined} code={code} group={group} handIn={handIn} />
        </View>
      ))}
    </View>
  );
}

type WorkSlot = WorkItem["slots"][number];
type HandInFn = ReturnType<typeof useHandIn>["handIn"];

/** One slot: its picker, the pick waiting to be confirmed, the hand-in on its way, or "Handed in". */
function Slot({ item, slot, flow, code, group, handIn }: { item: WorkItem; slot: WorkSlot; flow: Flow | undefined; code: string; group: Group; handIn: HandInFn }) {
  // Another hand-in is still on its way: one at a time.
  const elsewhere = useSending();
  const dest = SOURCE[item.source];
  if (slot.takes === "turnitin") return <Note glyph="lock" text="This one goes through Turnitin, which needs Compass itself." />;
  // Each step is keyed, so the one coming in is a view of its own and has its arrival.
  if (!flow)
    return (
      <Arrive key="pick">
        <Picker item={item} slot={slot} onPick={pick => setFlow(item.key, { code, slotId: slot.id, pick, group, phase: "confirm" })} />
      </Arrive>
    );

  const pick = flow.pick;
  const name = pick.kind === "file" ? pick.file.name : (hostOf(pick.url) ?? pick.url);
  if (flow.phase === "done") return <Done key="done" dest={dest} name={name} again={item.canSubmit} onAgain={() => setFlow(item.key, null)} />;

  const send = async () => {
    const base = { code, slotId: slot.id, pick, group };
    setFlow(item.key, { ...base, phase: "sending" });
    const r = await handIn(item, slot.id, pick.kind === "file" ? { file: pick.file } : { url: pick.url }, share => setProgress(item.key, share));
    if (r.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(`Handed in to ${dest}`);
      setFlow(item.key, { ...base, phase: "done" });
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFlow(item.key, { ...base, phase: "failed", message: r.message });
    }
  };
  const failed = flow.phase === "failed";
  // The pick stays put from asking to sending (and back, if it fails); only what is under it changes, and it arrives as
  // it does. The whole of it arrives with the pick (the picker gone), its first step simply there inside it.
  return (
    <Arrive key="picked">
      <LayoutAnimationConfig skipEntering>
        <View style={{ gap: space[3] }}>
          <PickedCard pick={pick} />
          {flow.phase === "sending" ? (
            <Animated.View key="sending" entering={focusIn()}>
              <Sending itemKey={item.key} pick={pick} dest={dest} />
            </Animated.View>
          ) : (
            <Arrive key={flow.phase}>
              <View style={{ gap: space[3] }}>
                {failed && (
                  <Notice status="fail" title="It did not go in">
                    {flow.message}
                  </Notice>
                )}
                <Text variant="bodySm">
                  {pick.kind === "file" ? (
                    <>
                      Hand in <Text variant="bodySm" style={{ fontWeight: "600" }}>{pick.file.name}</Text> to {dest}?
                    </>
                  ) : (
                    `Hand in this link to ${dest}?`
                  )}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space[2] }}>
                  {elsewhere && (
                    <Text variant="caption" tone="3" style={{ flex: 1 }}>
                      Another hand-in is still going
                    </Text>
                  )}
                  {/* The pair as one glass group, as iOS sets a sheet's cancel beside its action. */}
                  <GlassGroup style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexShrink: 0 }}>
                    <Button variant="secondary" size="sm" onPress={() => setFlow(item.key, null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={elsewhere}
                      icon={<Glyph name="upload" size={13} color={day.paper} />}
                      onPress={() => void send()}
                      accessibilityLabel={pick.kind === "file" ? `Hand in ${pick.file.name} to ${dest}` : `Hand in the link to ${dest}`}
                    >
                      {failed ? "Try again" : "Hand in"}
                    </Button>
                  </GlassGroup>
                </View>
              </View>
            </Arrive>
          )}
        </View>
      </LayoutAnimationConfig>
    </Arrive>
  );
}

/**
 * On its way, under the pick: the upload's progress while the file goes to storage (the bar easing on with each tick),
 * then Compass or Connect taking it.
 */
function Sending({ itemKey, pick, dest }: { itemKey: string; pick: HandInPick; dest: string }) {
  const c = useTheme();
  const share = useProgress(itemKey);
  const uploading = pick.kind === "file" && (share ?? 0) < 1;
  const label = uploading ? `Uploading${share != null && share > 0 ? ` ${Math.round(share * 100)}%` : ""}…` : `Handing in to ${dest}…`;
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <ActivityIndicator size="small" color={c.text2} />
        <Text variant="caption" tone="2" style={{ fontVariant: ["tabular-nums"] }}>
          {label}
        </Text>
      </View>
      {uploading && <Meter value={share ?? 0} color={c.neo} height={4} />}
    </View>
  );
}

/**
 * The check landing, as the web's does: from a little small and clear to full size, on the snap spring (a touch of give,
 * nothing that wobbles, no spin).
 */
const checkIn: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: { opacity: withTiming(1, timing.state), transform: [{ scale: withSpring(1, springs.snap) }] },
  };
};

/**
 * Handed in: a check in green, where it went and what. Landing, the check pops in and the words come into focus a step
 * after it; the glass button beside them is simply there (glass never fades).
 */
function Done({ dest, name, again, onAgain }: { dest: string; name: string; again: boolean; onAgain: () => void }) {
  const c = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 }}>
      <Animated.View entering={checkIn}>
        <Glyph name="check" size={24} color={c.okText} />
      </Animated.View>
      <Animated.View entering={focusIn(1)} style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ fontWeight: "600" }}>
          Handed in to {dest}
        </Text>
        <Text variant="caption" tone="2" numberOfLines={1} ellipsizeMode="middle">
          {name}
        </Text>
      </Animated.View>
      {again && (
        <Button variant="secondary" size="sm" onPress={onAgain}>
          Hand in another
        </Button>
      )}
    </View>
  );
}

/** The file or link about to go in: a photo as itself, a file as its kind, with its size or a link's site. */
function PickedCard({ pick }: { pick: HandInPick }) {
  const c = useTheme();
  const kind = pick.kind === "file" ? fileKind(pick.file.name, pick.file.mimeType) : linkKind(pick.url);
  const image = pick.kind === "file" && (pick.photo || kind.glyph === "image");
  const meta = pick.kind === "file" ? [pick.photo ? "Photo" : kind.label, sizeText(pick.file.size)].filter(Boolean).join(" · ") : (hostOf(pick.url) ?? "Link");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        padding: space[2],
        paddingRight: space[3],
        borderRadius: radius.overlay,
        borderCurve: "continuous",
        backgroundColor: c.shell,
        borderWidth: 1,
        borderColor: c.lineFaint,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.tag, borderCurve: "continuous", overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: c.paper }}>
        {image && pick.kind === "file" ? (
          <Image source={{ uri: pick.file.uri }} contentFit="cover" style={{ width: 40, height: 40 }} accessibilityIgnoresInvertColors />
        ) : (
          <KindGlyph kind={kind} size={20} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={1} ellipsizeMode="middle">
          {pick.kind === "file" ? pick.file.name : pick.url}
        </Text>
        <Text variant="caption" tone="3" numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

const LINK = /^https?:\/\/[^\s/.]+\.[^\s]+$/i;

/** Where the work is chosen: a file, a photo, and on a Compass slot that takes one, a link pasted. */
function Picker({ item, slot, onPick }: { item: WorkItem; slot: WorkSlot; onPick: (pick: HandInPick) => void }) {
  const c = useTheme();
  const dest = SOURCE[item.source];
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [picking, setPicking] = useState(false);
  const link = url.trim();

  /** Takes a picked file, or says why it cannot go in, as the web's picker does. */
  const take = (file: PickedFile | null, photo: boolean) => {
    if (!file) return;
    if (file.size != null && file.size > MAX_UPLOAD) return setError(`${file.name} is over 40 MB. Hand it in on ${dest} itself.`);
    if (file.size === 0) return setError(`${file.name} is empty.`);
    setError(null);
    onPick({ kind: "file", file, photo });
  };

  const run = async (what: () => Promise<void>, failed: string) => {
    if (picking) return;
    setPicking(true);
    setError(null);
    setDenied(false);
    try {
      await what();
    } catch {
      setError(failed);
    } finally {
      setPicking(false);
    }
  };

  const chooseFile = () => run(async () => take(await pickFile(), false), "The file picker did not open. Try again.");
  const choosePhoto = () =>
    run(async () => {
      const from = await askPhotoSource(c.dark);
      if (!from) return;
      const r = await pickPhoto(from);
      if (r === "denied") {
        setDenied(true);
        return setError("Compass Neo needs the camera to take a photo of your work. Allow it in Settings, or choose a photo instead.");
      }
      take(r, true);
    }, "The camera or photo library did not open. Try again.");

  const addLink = () => {
    if (!link) return;
    if (!LINK.test(link)) return setLinkError("That link should start with https://.");
    setLinkError(null);
    onPick({ kind: "link", url: link });
  };

  return (
    <View style={{ gap: space[3] }}>
      <GlassGroup style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
        <Button variant="secondary" size="sm" disabled={picking} icon={<Icon ios="folder.fill" android="folder_open" size={15} color={c.text1} weight="medium" />} onPress={() => void chooseFile()}>
          Choose a file
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={picking}
          icon={<Icon ios="camera.fill" android="photo_camera" size={15} color={c.text1} weight="medium" />}
          onPress={() => void choosePhoto()}
          accessibilityLabel="Photo: take one or choose from your photos"
        >
          Photo
        </Button>
      </GlassGroup>
      <Text variant="caption" tone="3">
        One file, up to 40 MB
      </Text>
      {slot.takes === "file-or-link" && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Field
              value={url}
              onChangeText={t => {
                setUrl(t);
                if (linkError) setLinkError(null);
              }}
              placeholder="Or paste a link"
              accessibilityLabel="A link to hand in"
              keyboardType="url"
              inputMode="url"
              textContentType="URL"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={addLink}
              error={linkError}
            />
          </View>
          <Button variant="secondary" size="sm" disabled={!link} onPress={addLink} style={{ marginTop: 8 }}>
            Use link
          </Button>
        </View>
      )}
      {error && (
        <View accessibilityLiveRegion="polite" style={{ gap: space[1], alignItems: "flex-start" }}>
          <Note glyph="warning" color={c.failText} text={error} />
          {denied && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon ios="gearshape.fill" android="settings" size={15} color={c.text1} weight="medium" />}
              onPress={() => void Linking.openSettings().catch(() => {})}
              style={{ marginTop: space[1] }}
            >
              Open Settings
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

/** A quiet line with a glyph: why it cannot go in, a refusal. */
function Note({ glyph, text, color }: { glyph: GlyphName; text: string; color?: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
      <Glyph name={glyph} size={13} color={color ?? c.text3} style={{ marginTop: 3 }} />
      <Text variant="bodySm" color={color} tone="2" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
