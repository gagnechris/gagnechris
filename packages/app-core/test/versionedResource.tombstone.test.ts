import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { createVersionedResource } from '../src/query/createVersionedResource.js';
import { act, renderHook } from './renderHook.js';

type Doc = { id: string; version: number; deleted: boolean };

const KEY = ['docs', 'today'] as const;

const fetchWith = async (cached: Doc, fetched: Doc) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(KEY, cached);
  const resource = createVersionedResource<Doc, void>({
    queryKey: () => KEY,
    fetch: async () => fetched,
    update: async () => fetched,
    setCache: (qc, entity) => qc.setQueryData(KEY, entity),
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => ({}) as ApiClient,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children,
      }),
    });
  const { result } = renderHook(() => resource.useQuery(undefined), {
    wrapper,
  });
  for (let i = 0; i < 50 && !result.current.isFetchedAfterMount; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return result.current.data;
};

describe('versioned resource fetch vs cache', () => {
  test('a fresh placeholder beats a deleted cached entry with a higher version', async () => {
    const data = await fetchWith(
      { id: 'old', version: 2, deleted: true },
      { id: 'new', version: 0, deleted: false },
    );
    expect(data).toEqual({ id: 'new', version: 0, deleted: false });
  });

  test('a newer live cached entry still beats a stale fetch', async () => {
    const data = await fetchWith(
      { id: 'a', version: 3, deleted: false },
      { id: 'a', version: 2, deleted: false },
    );
    expect(data).toEqual({ id: 'a', version: 3, deleted: false });
  });
});
