import { AppApiProvider } from '@gagnechris/app-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createApiClient } from '../../api/client';

/** QueryClientProvider scoped to the admin chunk only (not the public SPA). */
export function AdminQueryProvider({ children }: { children: ReactNode }) {
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
  return (
    <AppApiProvider getClient={createApiClient}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AppApiProvider>
  );
}
