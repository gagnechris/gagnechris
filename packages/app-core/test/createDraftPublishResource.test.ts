import { describe, expect, test } from 'vitest';
import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient } from '@tanstack/react-query';
import { createDraftPublishResource } from '../src/query/createDraftPublishResource.js';

type FakeEntity = {
  id: string;
  title: string;
  version: number;
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges: boolean;
};

type FakeParams = { id: string };

/**
 * CHR-158: a new draft/publish entity is config only — no bespoke query module.
 */
describe('createDraftPublishResource fake-entity (CHR-158)', () => {
  test('config alone supplies queryKey, fetch, update, and setCache', async () => {
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
    const queryClient = new QueryClient();

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

    expect(fakeResource.queryKey({ id: 'f1' })).toEqual(['admin', 'fake', 'f1']);
    expect(await fakeResource.fetch(client, { id: 'f1' })).toMatchObject({
      title: 'Hello',
      version: 1,
    });

    const updated = await fakeResource.update(
      client,
      { id: 'f1' },
      { version: 1, title: 'Updated' },
    );
    expect(updated).toMatchObject({ title: 'Updated', version: 2 });

    fakeResource.setCache(queryClient, updated);
    expect(queryClient.getQueryData(['admin', 'fake', 'f1'])).toEqual(updated);
  });
});
