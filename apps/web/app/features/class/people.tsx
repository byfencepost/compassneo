import { useState } from "react";
import { SourceMark } from "@/components/brand/source-mark";
import { Button } from "@/components/glaze/ui/button";
import { Input } from "@/components/glaze/ui/input";
import { ChevronLeft, ChevronRight, Icon, NoResults, People } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import type { ClassLearners, Classmate } from "@/lib/neo/learners";
import { Block, SkeletonBlock } from "./sections";

/**
 * Classmates, from Connect (Compass will not show a student their class list). On the overview, a card with a strip of
 * faces and how many are in the class; pressed, the whole class as a grid of faces: the photo each chose on Connect, or
 * their initials on a colour of their own. The student comes first, marked as them. A filter finds someone in a big
 * class.
 */

/** Big enough a class to want a filter. */
const FILTER_FROM = 10;
/** Faces on the overview's strip. */
const STRIP = 7;

/** A colour per person, from their name, so the same person always wears the same one. */
function hueOf(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 12;
}

function namesOf(p: Classmate) {
  const words = p.name.trim().split(/\s+/);
  const first = p.first?.trim() || words[0] || p.name;
  const last = p.last?.trim() || words.slice(1).join(" ");
  return { first, last, initials: `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() };
}

/** A face: the photo, or the initials on the person's colour. */
function FaceCircle({ person, className }: { person: Classmate; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = person.photoUrl && failed !== person.photoUrl ? person.photoUrl : null;
  return (
    <span data-hue={hueOf(person.name)} className={cn("neo-person relative grid shrink-0 place-items-center overflow-hidden rounded-pill", className)}>
      <span aria-hidden className={photo ? "invisible" : undefined}>
        {namesOf(person).initials}
      </span>
      {photo && <img src={photo} alt="" loading="lazy" draggable={false} onError={() => setFailed(photo)} className="absolute inset-0 size-full object-cover" />}
    </span>
  );
}

const readyOf = (data: ClassLearners | null | undefined) => (data?.learners.status === "ready" ? data.learners.data : null);

/** The overview's card: a strip of faces (the student, then those with photos) and the class's size. Opens the list. */
export function ClassmatesBlock({ data, onMore }: { data: ClassLearners | null | undefined; onMore: () => void }) {
  const all = readyOf(data);
  if (!all?.length) return null;
  const others = all.length - 1;
  const strip = [...all].sort((a, b) => Number(b.me) - Number(a.me) || Number(!!b.photoUrl) - Number(!!a.photoUrl)).slice(0, STRIP);
  return (
    <Block icon={People} title="Classmates" onMore={onMore}>
      {/* eslint-disable-next-line glaze/no-native-control -- the card's one row opens the class list: a Glaze Button would draw a pill inside the card */}
      <button type="button" onClick={onMore} className="neo-row-button flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-start">
        <span className="flex shrink-0 -space-x-2">
          {strip.map(p => (
            <FaceCircle key={p.id} person={p} className="neo-person-sm size-8 ring-2 ring-paper" />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate type-label text-text-1">{others > 0 ? `You and ${others} others` : "Just you"}</span>
        <Icon icon={ChevronRight} size={16} className="text-text-3" />
      </button>
    </Block>
  );
}

function Face({ person }: { person: Classmate }) {
  const { first, last } = namesOf(person);
  return (
    <li className="flex min-w-0 flex-col items-center gap-2 text-center" title={person.name}>
      <span className="neo-person-ring" data-me={person.me || undefined}>
        <FaceCircle person={person} className="size-12" />
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate type-label text-text-1">{first}</span>
        {person.me ? <span className="neo-you block">You</span> : <span className="block truncate type-caption text-text-3">{last || " "}</span>}
      </span>
    </li>
  );
}

/** The whole class, opened from the overview's card. */
export function PeoplePage({ data, onBack }: { data: ClassLearners | null | undefined; onBack: () => void }) {
  const [q, setQ] = useState("");
  const back = (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="-ms-2">
        <Icon icon={ChevronLeft} />
        Overview
      </Button>
    </div>
  );
  if (!data) return data === null ? null : <SkeletonBlock rows={[64, 64, 64]} />;
  const side = data.learners;
  if (side.status === "none") return back;
  if (side.status === "missing")
    return (
      <>
        {back}
        <SkeletonBlock rows={[64, 64, 64]} />
      </>
    );
  if (side.status === "unavailable")
    return (
      <>
        {back}
        <Block icon={People} title="Classmates" className="px-4 py-3.5">
          <p className="type-body-sm text-text-2">{side.reason}</p>
        </Block>
      </>
    );

  const all = side.data;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? all.filter(p => words.every(w => p.name.toLowerCase().includes(w))) : all;
  return (
    <>
      {back}
      {all.length >= FILTER_FROM && (
        <Input mode="search" aria-label="Find a classmate" placeholder={`Find someone in ${all.length} people`} value={q} onValueChange={setQ} />
      )}
      <Block icon={People} title={`${all.length} in the class`} className="p-3.5">
        {shown.length ? (
          <ul className="neo-people">
            {shown.map(p => (
              <Face key={p.id} person={p} />
            ))}
          </ul>
        ) : (
          <p className="flex items-center justify-center gap-2 py-4 type-label text-text-2">
            <Icon icon={NoResults} size={16} className="text-text-3" />
            No one called “{q.trim()}”
          </p>
        )}
      </Block>
      {data.connectClass && (
        <p className="flex min-w-0 items-center gap-1.5 px-1 type-caption text-text-3">
          <SourceMark source="connect" size={12} />
          <span className="min-w-0 truncate">{data.connectClass.name}</span>
        </p>
      )}
    </>
  );
}
