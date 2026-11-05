import { useState, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";

const URL = import.meta.env.VITE_CONVEX_URL as string | undefined;

/**
 * Convex, with a query cache that keeps a subscription alive for five minutes after the last component using it
 * unmounts, so going back to a screen shows its data at once instead of loading again.
 */
export function Backend({ children }: { children: ReactNode }) {
  // Made on first render, not at import: SPA mode imports this module at build time to write index.html.
  const [client] = useState(() => {
    if (!URL) throw new Error("VITE_CONVEX_URL is not set. Copy it from packages/backend/.env.local (CONVEX_URL).");
    return new ConvexReactClient(URL);
  });
  return (
    <ConvexProvider client={client}>
      <ConvexQueryCacheProvider expiration={5 * 60 * 1000} maxIdleEntries={64}>
        {children}
      </ConvexQueryCacheProvider>
    </ConvexProvider>
  );
}

export const convexUrl = URL;
