import { useEffect } from "react";
import { day, night } from "@compassneo/brand";
import { persisted } from "./store";
import { morph } from "./morph";

/**
 * Light, dark, or following the device. Dark is the default. The choice is kept on the device; root.tsx applies it
 * before the first paint (THEME_SCRIPT), so a light-theme reload never flashes dark.
 */
export type ThemeChoice = "light" | "dark" | "system";

const KEY = "cneo.theme.v1";
export const themeChoice = persisted<ThemeChoice>(KEY, "dark");

const prefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
const resolve = (c: ThemeChoice) => (c === "system" ? (prefersDark() ? "dark" : "light") : c);

function apply(c: ThemeChoice) {
  const theme = resolve(c);
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? night.page : day.page);
}

/** Choosing a theme cross-fades the whole screen into it. */
export function chooseTheme(c: ThemeChoice) {
  if (resolve(c) === document.documentElement.dataset.theme) return themeChoice.set(c);
  void morph(() => {
    themeChoice.set(c);
    apply(c);
  }, "theme");
}

/** Keeps <html> on the chosen theme, and on the device's when following it. Mounted once, in root.tsx. */
export function useTheme() {
  const choice = themeChoice.use();
  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply("system");
    mq.addEventListener("change", follow);
    return () => mq.removeEventListener("change", follow);
  }, [choice]);
  return choice;
}

/** Runs in <head> before anything paints: the kept choice onto <html>. */
export const THEME_SCRIPT = `try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||'"dark"');var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=d?${JSON.stringify(night.page)}:${JSON.stringify(day.page)}}catch(e){}`;
