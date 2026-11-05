import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: the app is static and talks to Convex from the browser.
  // The future watch and mobile apps share the same Convex backend.
  ssr: false,
} satisfies Config;
