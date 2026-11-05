import { MotionConfig } from "motion/react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/outfit";
import "@/components/glaze/styles.css";
import "@/components/brand/brand.css";
import "@/features/timetable/timetable.css";
import "@/features/class/class.css";
import "@/features/student/student.css";
import "@/features/home/announcements.css";
import "@/features/viewer/viewer.css";
import "@mediansh/widget/styles.css";
import "@/features/support/support.css";

import type { Route } from "./+types/root";
import { GlazePortalProvider } from "@/lib/glaze/portal";
import { Backend, convexUrl } from "@/lib/neo/backend";
import { Button } from "@/components/glaze/ui/button";
import { NeoMark } from "@/components/brand/logo";
import { night } from "@compassneo/brand";
import { THEME_SCRIPT, useTheme } from "@/lib/neo/theme";
import { Support } from "@/features/support/support";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  ...(convexUrl ? [{ rel: "preconnect", href: convexUrl }] : []),
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // data-system="glaze" puts Glaze's tokens on <html> too: the page colour reaches overscroll, and the view
    // transition layers (children of <html>, not <body>) can read the motion tokens.
    <html lang="en-AU" data-system="glaze" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* The browser chrome takes a literal colour, so it comes from the brand package, not a CSS token. */}
        <meta name="theme-color" content={night.page} />
        {/* The theme the person chose, on <html> before anything paints (lib/neo/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body className="glaze">
        <GlazePortalProvider>{children}</GlazePortalProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    // Springs (lib/neo/motion.ts) give way to plain changes when the person asks for less motion.
    <MotionConfig reducedMotion="user">
      <ThemeKeeper />
      <Backend>
        <Outlet />
        <Support />
      </Backend>
    </MotionConfig>
  );
}

/** Keeps <html> on the chosen theme (and on the device's, when following it). */
function ThemeKeeper() {
  useTheme();
  return null;
}

/** What index.html shows until the app's script runs: the page colour, so nothing flashes. */
export function HydrateFallback() {
  return <div className="min-h-dvh bg-page" />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  const detail = import.meta.env.DEV && error instanceof Error ? error.message : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-5">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <NeoMark size={48} />
        <h1 className="type-heading text-text-1">{missing ? "This page is off the map" : "Something went wrong"}</h1>
        <p className="type-body-sm text-text-2">
          {missing ? "The address does not match a page in Compass Neo." : "Compass Neo hit an error it did not expect."}
        </p>
        {detail && <p className="type-code-sm text-text-2">{detail}</p>}
        <Button render={<a href="/" />} nativeButton={false} variant="secondary">
          Go to the start
        </Button>
      </div>
    </main>
  );
}
