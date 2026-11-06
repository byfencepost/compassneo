import * as WebBrowser from "expo-web-browser";
import type { Palette } from "@/theme/tokens";

/** The web app, where what the phone cannot do yet lives: Canvas, the calendar feed, AI access. */
export const WEB_URL = "https://compassneo.app";

/**
 * Opens the web app in the in-app browser (Safari's sheet on iOS, a custom tab on Android), in the theme's colours,
 * so it reads as a page of this app rather than a jump to another.
 */
export function openWeb(c: Palette) {
  void WebBrowser.openBrowserAsync(WEB_URL, {
    controlsColor: c.neoText,
    toolbarColor: c.page,
    dismissButtonStyle: "done",
  }).catch(() => {});
}
