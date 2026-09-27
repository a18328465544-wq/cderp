import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {ReactNode} from "react";
import {NotificationToaster} from "@/src/components/common";
import {AuthProvider} from "./auth";

// ERP pages already expose explicit refresh/retry actions. Keeping stale data in
// the cache for a short window prevents tab switches and window focus events
// from turning into a burst of duplicate requests, while mutations still
// invalidate the affected query keys immediately.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export function AppProviders({children}: {children: ReactNode}) {
  return <QueryClientProvider client={queryClient}><AuthProvider>{children}</AuthProvider><NotificationToaster /></QueryClientProvider>;
}
