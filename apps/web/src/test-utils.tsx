/* eslint-disable react-refresh/only-export-components */
import { AppApiProvider } from '@gagnechris/app-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { createApiClient } from './api/client';

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

/** Wrap UI that already has its own router with an optional QueryClient. */
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
