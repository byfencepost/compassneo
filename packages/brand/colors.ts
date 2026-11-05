/**
 * Surfaces and ink are neutral; Neo blue is only ever the accent.
 * Compass Neo's brand colours, for clients that do not read the web's CSS tokens (React Native, watchOS).
 * The web app's source of truth is apps/web/app/components/glaze/tokens.css; keep these in step with it.
 */
export const brand = {
  /** Neo blue: the mark's dial and "neo" in the wordmark. */
  neo: "#0081FF",
  /** The north needle. The mark only, never a status. */
  needle: "#FF1F3D",
} as const;

export const night = {
  page: "#0C0C0C",
  shell: "#161616",
  paper: "#1F1F1F",
  field: "#2A2A2A",
  ink: "#F4F4F3",
  focus: "#4DA3FF",
  neoText: "#5AAAFF",
} as const;

export const day = {
  page: "#FBFBFA",
  shell: "#F1F1F0",
  paper: "#FFFFFF",
  field: "#EFEFEF",
  ink: "#050505",
  focus: "#0070E0",
  neoText: "#0067D1",
} as const;
