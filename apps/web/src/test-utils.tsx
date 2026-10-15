/* eslint-disable react-refresh/only-export-components */
import { AppApiProvider, AUTOSAVE_DEBOUNCE_MS } from '@gagnechris/app-core';
import { PublicLinkContext } from '@gagnechris/public-ui';
import {
  DEFAULT_NOTEBOOK_AREAS,
  NOTEBOOK_GROUP,
  SITE_ADMIN_GROUP,
} from '@gagnechris/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { onTestFinished, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import SiteLink from './components/SiteLink';
import { ConfirmDialogHost } from './workspace/ui/ConfirmDialogHost';
import { confirmStore } from './workspace/confirmDialog';
import { createApiClient } from './workspace/api/client';
import type { AuthUser } from './workspace/auth/session';
import type { NotebookOutletContext } from './notebook/NotebookLayout';

/** Fake-timer advance that is just past the autosave debounce. */
export const PAST_AUTOSAVE_MS = AUTOSAVE_DEBOUNCE_MS + 50;

export const testAuthUser: AuthUser = {
  label: 'chris@example.com',
  userId: 'u1',
  groups: [SITE_ADMIN_GROUP, NOTEBOOK_GROUP],
};

/** What NotebookLayout gives its pages with the Work area chosen. */
export const workOutletContext: NotebookOutletContext = {
  area: 'work',
  areaName: 'Work',
  areas: DEFAULT_NOTEBOOK_AREAS,
  setArea: () => {},
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
        <BrowserRouter>
          {/* As the public app's root layout provides it. */}
          <PublicLinkContext.Provider value={SiteLink}>
            {children}
          </PublicLinkContext.Provider>
        </BrowserRouter>
        <ConfirmDialogHost />
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
      <QueryClientProvider client={client}>
        {children}
        <ConfirmDialogHost />
      </QueryClientProvider>
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

/** Answers every in-app confirm with the spy's return value until the test ends. */
export const answerConfirms = (answer: boolean) => {
  const spy = vi.fn((_message: string, _action: string) => answer);
  const unsubscribe = confirmStore.subscribe(() => {
    const request = confirmStore.get();
    if (request) confirmStore.answer(spy(request.message, request.action));
  });
  onTestFinished(() => {
    unsubscribe();
  });
  return spy;
};
