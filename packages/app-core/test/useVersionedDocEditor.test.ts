import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { ApiError } from '../src/query/api.js';
import { createVersionedResource } from '../src/query/createVersionedResource.js';
import { useVersionedDocEditor } from '../src/useVersionedDocEditor.js';
import { act, renderHook } from './renderHook.js';

/**
 * Non-publishable notebook-style note: version only, no status /
 * hasUnpublishedChanges (CHR-173).
 */
type FakeNote = {
  id: string;
  body: string;
  version: number;
};

type FakeNoteParams = { id: string };

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const waitUntil = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
};

describe('useVersionedDocEditor fake note (CHR-173)', () => {
  test('autosave, conflict detection, and delete-with-hold without publish fields', async () => {
    const store = new Map<string, FakeNote>([
      ['n1', { id: 'n1', body: 'hello', version: 1 }],
    ]);
    const client = {} as ApiClient;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const noteResource = createVersionedResource<FakeNote, FakeNoteParams>({
      queryKey: ({ id }) => ['notebook', 'notes', id] as const,
      fetch: async (_c, { id }) => {
        const note = store.get(id);
        if (!note) throw new Error('missing');
        return { ...note };
      },
      update: async (_c, { id }, body) => {
        const prev = store.get(id)!;
        if (body.version !== prev.version) {
          throw new ApiError('Conflict', 409);
        }
        const next = {
          ...prev,
          body: String(body.body ?? prev.body),
          version: prev.version + 1,
        };
        store.set(id, next);
        return next;
      },
      delete: async (_c, { id }) => {
        const prev = store.get(id)!;
        store.delete(id);
        return prev;
      },
      setCache: (qc, entity) => {
        qc.setQueryData(['notebook', 'notes', entity.id], entity);
      },
    });

    const confirm = vi.fn(async () => true);
    const onDeleted = vi.fn();

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AppApiProvider, {
        getClient: () => client,
        children: createElement(QueryClientProvider, {
          client: queryClient,
          children,
        }),
      });

    const { result } = renderHook(
      () =>
        useVersionedDocEditor({
          resource: noteResource,
          params: { id: 'n1' },
          initialDraft: { body: '' },
          toDraft: (n) => ({ body: n.body }),
          getEntityId: (n) => n.id,
          toPayload: (draft) => ({ body: draft.body }),
          conflictMessage: 'Conflict — reload and try again.',
          confirm,
          delete: {
            confirm: 'Delete this note?',
            mutate: async () => {
              await noteResource.delete!(client, { id: 'n1' }, { version: 1 });
            },
            onDeleted,
          },
        }),
      { wrapper },
    );

    await waitUntil(() => !result.current.isLoading, 'hydrate');

    expect(result.current.entity).toMatchObject({
      id: 'n1',
      body: 'hello',
      version: 1,
    });
    expect(result.current.draft).toEqual({ body: 'hello' });
    expect(
      (result.current.entity as FakeNote & { status?: string }).status,
    ).toBeUndefined();

    act(() => {
      result.current.updateDraft((prev) => ({ ...prev, body: 'edited' }));
    });
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      const flushResult = await result.current.save();
      expect(flushResult).toBe('clean');
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.entity?.version).toBe(2);
    expect(store.get('n1')?.body).toBe('edited');

    // Stale version → 409 conflict message from app-core (no copied logic).
    store.set('n1', { id: 'n1', body: 'remote', version: 9 });
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        body: 'stale-local',
      }));
    });
    await act(async () => {
      const flushResult = await result.current.save();
      expect(flushResult).toBe('error');
    });
    expect(result.current.saveError).toBe('Conflict — reload and try again.');

    await act(async () => {
      await result.current.runDelete();
    });
    expect(confirm).toHaveBeenCalledWith('Delete this note?');
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(result.current.suppressLeaveGuardRef.current).toBe(true);
    expect(result.current.dirty).toBe(false);
  });
});
