/* eslint-disable react-refresh/only-export-components */
import { AppApiProvider, AUTOSAVE_DEBOUNCE_MS } from '@gagnechris/app-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { createApiClient } from './workspace/api/client';
import type { AuthUser } from './workspace/auth/session';

/** Fake-timer advance that is just past the autosave debounce. */
export const PAST_AUTOSAVE_MS = AUTOSAVE_DEBOUNCE_MS + 50;

export const testAuthUser: AuthUser = {
  label: 'chris@example.com',
  userId: 'u1',
  groups: ['site-admin', 'notebook'],
};

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

type ProvidersProps = {
  children: ReactNode;
  queryClient?: QueryClient;
};

const TestProviders = ({ children, queryClient }: ProvidersProps) => {
  const client = queryClient ?? createTestQueryClient();
  return (
    <AppApiProvider getClient={createApiClient}>
      <QueryClientProvider client={client}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </AppApiProvider>
  );
};

export const QueryClientTestProvider = ({
  children,
  queryClient,
}: ProvidersProps) => {
  const client = queryClient ?? createTestQueryClient();
  return (
    <AppApiProvider getClient={createApiClient}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AppApiProvider>
  );
};

export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient },
) => {
  const { queryClient, ...rest } = options ?? {};
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders queryClient={queryClient}>{children}</TestProviders>
    ),
    ...rest,
  });
};
