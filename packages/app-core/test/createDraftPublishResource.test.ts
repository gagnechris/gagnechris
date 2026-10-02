import { describe, expect, test } from 'vitest';
import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { createDraftPublishResource } from '../src/query/createDraftPublishResource.js';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { preferNewerByVersion } from '../src/query/cache.js';
import { act, renderHook } from './renderHook.js';

type FakeEntity = {
  id: string;
  title: string;
  version: number;
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges: boolean;
};

type FakeParams = { id: string };

/**
 * CHR-158 / CHR-165: config alone is not enough — exercise update/setCache,
 * preferNewerByVersion on stale fetch, and lifecycle mutators.
 */
describe('createDraftPublishResource fake-entity (CHR-158)', () => {
  test('update, setCache, stale fetch, and lifecycle mutators stay coherent', async () => {
    const store = new Map<string, FakeEntity>([
      [
        'f1',
        {
          id: 'f1',
          title: 'Hello',
          version: 1,
          status: 'draft',
          hasUnpublishedChanges: false,
        },
      ],
    ]);
    const client = {} as ApiClient;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const fakeResource = createDraftPublishResource<FakeEntity, FakeParams>({
      queryKey: ({ id }) => ['admin', 'fake', id] as const,
      fetch: async (_c, { id }) => {
        const entity = store.get(id);
        if (!entity) throw new Error('missing');
        return entity;
      },
      update: async (_c, { id }, body) => {
        const prev = store.get(id)!;
        const next = {
          ...prev,
          title: String(body.title ?? prev.title),
          version: prev.version + 1,
        };
        store.set(id, next);
        return next;
      },
      publish: async (_c, { id }, body) => {
        const prev = store.get(id)!;
        const next = {
          ...prev,
          status: 'published' as const,
          version: body.version + 1,
        };
        store.set(id, next);
        return next;
      },
      unpublish: async (_c, { id }) => {
        const prev = store.get(id)!;
        return {
          ...prev,
          status: 'draft' as const,
          version: prev.version + 1,
        };
      },
      discard: async (_c, { id }) => store.get(id)!,
      setCache: (qc, entity) => {
        qc.setQueryData(['admin', 'fake', entity.id], entity);
      },
    });

    expect(fakeResource.queryKey({ id: 'f1' })).toEqual([
      'admin',
      'fake',
      'f1',
    ]);

    const updated = await fakeResource.update(
      client,
      { id: 'f1' },
      { version: 1, title: 'Updated' },
    );
    expect(updated).toMatchObject({ title: 'Updated', version: 2 });
    fakeResource.setCache(queryClient, updated);

    // Prefer-newer must run inside queryFn — calling preferNewerByVersion
    // directly would leave the suite green if queryFn returned fetched (CHR-178).
    store.set('f1', {
      id: 'f1',
      title: 'Stale',
      version: 1,
      status: 'draft',
      hasUnpublishedChanges: false,
    });

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AppApiProvider, {
        getClient: () => client,
        children: createElement(QueryClientProvider, {
          client: queryClient,
          children,
        }),
      });

    const { result: queryResult } = renderHook(
      () => fakeResource.useQuery({ id: 'f1' }),
      { wrapper },
    );
    await act(async () => {
      await queryResult.current.refetch();
    });
    expect(queryResult.current.data).toEqual(updated);
    expect(preferNewerByVersion(updated, store.get('f1')!)).toEqual(updated);

    const { result } = renderHook(
      () => fakeResource.useLifecycleMutators({ id: 'f1' }),
      { wrapper },
    );

    let published!: Awaited<ReturnType<typeof result.current.publish>>;
    await act(async () => {
      published = await result.current.publish({ version: 2 });
    });
    expect(published.data).toMatchObject({ status: 'published', version: 3 });
    expect(queryClient.getQueryData(['admin', 'fake', 'f1'])).toEqual(
      expect.objectContaining({ status: 'published', version: 3 }),
    );
  });
});
