import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";
import { persisted, useStored } from "@/lib/store";
import { day, night, type Palette } from "./tokens";

/** Dark by default, as on the web; light, or follow the phone. */
export type ThemePref = "dark" | "light" | "auto";
export const themePref = persisted<ThemePref>("cneo.theme.v1", "dark");

const ThemeContext = createContext<Palette>(night);

/**
 * The palette for the whole app, and the phone told the same: a theme picked here (not "auto") overrides the app's
 * native appearance too, so what iOS and Android draw themselves follows it: Liquid Glass (a group of glass shapes
 * takes the window's appearance, not each shape's own), the navigation bars, pull to refresh, the keyboard, alerts.
 */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const pref = useStored(themePref);
  const system = useColorScheme();
  useEffect(() => {
    Appearance.setColorScheme(pref === "auto" ? "unspecified" : pref);
  }, [pref]);
  const dark = pref === "auto" ? system !== "light" : pref === "dark";
  return <ThemeContext.Provider value={dark ? night : day}>{children}</ThemeContext.Provider>;
}

/** The palette for the theme in use: `const c = useTheme(); c.text1`. */
export const useTheme = () => useContext(ThemeContext);
