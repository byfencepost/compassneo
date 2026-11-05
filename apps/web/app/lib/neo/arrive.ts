import { useEffect, useState, type AnimationEvent } from "react";

/**
 * A screen arriving on a cold load (brand.css, .neo-arrive): a soft edge runs down it from the top. Only the first
 * screen of a page load does this; a screen reached from another one is morphed into instead, so there is never an
 * empty beat between them. The class goes once the edge has passed, so a settled screen carries no mask.
 */
export function useArrival() {
  // Both StrictMode passes read this before the effect marks the page as arrived.
  const [cold] = useState(() => typeof document !== "undefined" && !document.documentElement.hasAttribute("data-arrived"));
  const [done, setDone] = useState(false);
  useEffect(() => {
    document.documentElement.setAttribute("data-arrived", "");
  }, []);
  return {
    className: cold && !done ? "neo-arrive" : undefined,
    onAnimationEnd: (e: AnimationEvent<HTMLElement>) => {
      if (e.target === e.currentTarget && e.animationName === "neo-arrive") setDone(true);
    },
  };
}
