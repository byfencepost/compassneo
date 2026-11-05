import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Icon, type GlazeIcon } from "@/components/glaze/icon";
import { cn } from "@/lib/glaze/utils";
import { spring } from "@/lib/neo/motion";
import { useEdgeFade } from "./kit";

export type TabSpec<T extends string> = { id: T; label: string; icon: GlazeIcon };

/** A tab's glyph and the gap after it (16 + 6): what a tab gives up when the glyphs go. */
const GLYPH = 22;

/**
 * The panel's sections: one track the width of the panel, every section named, the open one on a thumb in the class's
 * colour that glides between them. Tabs keep their room (12px each side and a gap between) and are never squeezed:
 * each carries its glyph while the track has room for every one; when it does not, the glyphs go and the names keep
 * their spacing; if even the names do not fit, the track scrolls sideways, its edges fading where there is more, and
 * keeps the open one in view.
 *
 * A tablist with the arrow keys, Home and End (focus follows the choice).
 */
export function TabSwitcher<T extends string>({
  tabs,
  value,
  onChange,
  label,
  panelId,
  idOf,
  fit,
}: {
  tabs: Array<TabSpec<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  panelId: string;
  idOf: (id: T) => string;
  /** As wide as its tabs, not the panel (a maximised panel, where stretched tabs would sit far apart). */
  fit?: boolean;
}) {
  const ids = tabs.map(t => t.id).join(",");
  const track = useEdgeFade<HTMLDivElement>([ids]);
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const [bare, setBare] = useState(false);
  const index = Math.max(0, tabs.findIndex(t => t.id === value));

  // Whether every tab fits with its glyph at its full spacing: the tabs' own content, their padding and the gaps,
  // against the track. Measured before paint and again whenever the track's width changes (the panel expanding, the
  // window turning) or a name's does (the web font arriving).
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const fit = () => {
      const tabs = [...el.querySelectorAll<HTMLElement>("[role=tab]")];
      if (!tabs.length) return;
      const style = getComputedStyle(el);
      const gap = parseFloat(style.columnGap) || 0;
      let need = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + gap * (tabs.length - 1);
      for (const tab of tabs) {
        // The label's box (after the thumb, when the tab is open) holds the glyph and the name at their own width.
        const inner = tab.lastElementChild as HTMLElement | null;
        const s = getComputedStyle(tab);
        need += (inner?.offsetWidth ?? 0) + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
        if (el.dataset.bare != null) need += GLYPH;
      }
      setBare(need > el.clientWidth + 0.5);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    for (const inner of el.querySelectorAll("[role=tab] > :last-child")) ro.observe(inner);
    return () => ro.disconnect();
  }, [ids, track]);

  // The open tab stays in view when the track scrolls.
  useLayoutEffect(() => {
    const el = track.current;
    const tab = refs.current.get(value);
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    const left = tab.offsetLeft - 24;
    const right = tab.offsetLeft + tab.offsetWidth + 24 - el.clientWidth;
    if (el.scrollLeft > left) el.scrollTo({ left, behavior: "smooth" });
    else if (el.scrollLeft < right) el.scrollTo({ left: right, behavior: "smooth" });
  }, [value, bare, track]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : step ? (index + step + tabs.length) % tabs.length : -1;
    if (to < 0) return;
    e.preventDefault();
    const id = tabs[to]!.id;
    onChange(id);
    refs.current.get(id)?.focus();
  };

  return (
    <div className={cn("neo-tabs", fit && "w-fit max-w-full")}>
      {/* layoutScroll: the thumb glides inside a track that can scroll, so motion measures it against the scroll. */}
      <motion.div
        layoutScroll
        ref={track}
        role="tablist"
        aria-label={label}
        data-bare={bare || undefined}
        onKeyDown={onKey}
        className="neo-tabs-scroll neo-fade-x flex w-full items-center gap-1 p-1"
      >
        {tabs.map(t => {
          const on = t.id === value;
          return (
            // eslint-disable-next-line glaze/no-native-control -- a tab on the switcher's own track: a Glaze Button would draw its own pill under the thumb
            <button
              key={t.id}
              ref={el => {
                if (el) refs.current.set(t.id, el);
                else refs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={idOf(t.id)}
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              data-on={on || undefined}
              onClick={() => onChange(t.id)}
              className={cn("neo-tab relative flex h-(--control) shrink-0 items-center justify-center focus-visible:focus-ring", fit ? "px-4" : "grow px-3")}
            >
              {on && <motion.span layoutId="neo-tab-thumb" aria-hidden className="neo-tab-thumb absolute inset-0" transition={spring.morph} />}
              <span className="relative flex items-center gap-1.5">
                <Icon icon={t.icon} size={16} className="neo-tab-glyph shrink-0" />
                <span className="whitespace-nowrap type-label-sm">{t.label}</span>
              </span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
