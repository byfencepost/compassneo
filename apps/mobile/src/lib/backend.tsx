import { useState, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";

const URL = process.env.EXPO_PUBLIC_CONVEX_URL;

/**
 * Convex, the same deployment the web app uses, with a query cache that keeps a subscription alive for five minutes
 * after the last screen using it goes away, so going back to a tab shows its data at once instead of loading again.
 */
export function Backend({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    if (!URL) throw new Error("EXPO_PUBLIC_CONVEX_URL is not set. Copy it into apps/mobile/.env.local from packages/backend/.env.local (CONVEX_URL).");
    // No window to warn on before it closes.
    return new ConvexReactClient(URL, { unsavedChangesWarning: false });
  });
  return (
    <ConvexProvider client={client}>
      <ConvexQueryCacheProvider expiration={5 * 60 * 1000} maxIdleEntries={64}>
        {children}
      </ConvexQueryCacheProvider>
    </ConvexProvider>
  );
}

/** The deployment's HTTP actions (file links, calendar feed): .convex.cloud becomes .convex.site. */
export const siteUrl = URL?.replace(/\.convex\.cloud\/?$/, ".convex.site") ?? "";
