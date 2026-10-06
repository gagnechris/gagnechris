import {
  AppApiProvider,
  createVersionedResource,
  useQueuedAutosave,
} from '@gagnechris/app-core';
import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

/**
 * `apps/mobile` has its own lockfile and its own React / react-query, while
 * app-core resolves the workspace-root copies. Rendering an app-core hook with
 * this app's renderer only works while a single instance of each is loaded: a
 * second copy leaves its hook dispatcher null and throws.
 */
describe('app-core hooks under the mobile React', () => {
  it('runs useQueuedAutosave with one React instance', () => {
    const states: string[] = [];

    function Host() {
      const autosave = useQueuedAutosave({
        draft: 'hello',
        dirty: false,
        setDirty: () => {},
        getBaseVersion: () => 1,
        performSave: async () => ({
          ok: true as const,
          entity: { version: 2 },
        }),
        onSaved: () => {},
        conflictMessage: 'conflict',
        tooLargeMessage: 'Too large.',
      });
      states.push(autosave.saveState);
      return null;
    }

    act(() => {
      create(createElement(Host));
    });

    expect(states).toEqual(['idle']);
  });
});

describe('app-core query hooks under mobile react-query', () => {
  it('runs createVersionedResource.useQuery with one QueryClientProvider', () => {
    type Note = { id: string; body: string; version: number };
    const resource = createVersionedResource<Note, { id: string }>({
      queryKey: ({ id }) => ['mobile', 'note', id] as const,
      fetch: async () => ({ id: 'n1', body: 'hi', version: 1 }),
      update: async (_c, _p, body) => ({
        id: 'n1',
        body: String(body.body ?? ''),
        version: Number(body.version) + 1,
      }),
      tooLargeMessage: 'Too large.',
      setCache: (qc, entity) => {
        qc.setQueryData(['mobile', 'note', entity.id], entity);
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['mobile', 'note', 'n1'], {
      id: 'n1',
      body: 'hi',
      version: 1,
    });

    let sawBody: string | undefined;

    function Host() {
      const query = resource.useQuery({ id: 'n1' });
      sawBody = query.data?.body;
      return null;
    }

    act(() => {
      create(
        createElement(AppApiProvider, {
          getClient: () => ({}) as ApiClient,
          children: createElement(QueryClientProvider, {
            client: queryClient,
            children: createElement(Host),
          }),
        }),
      );
    });

    expect(sawBody).toBe('hi');
  });
});
