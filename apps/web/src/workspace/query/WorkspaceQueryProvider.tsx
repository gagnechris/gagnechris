import { AppApiProvider } from '@gagnechris/app-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createApiClient } from '../api/client';

/** QueryClientProvider scoped to the admin chunk only (not the public SPA). */
export function WorkspaceQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  // One client, so concurrent 401s share a single token refresh.
  const [getClient] = useState(() => {
    const api = createApiClient();
    return () => api;
  });
  return (
    <AppApiProvider getClient={getClient}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AppApiProvider>
  );
}
