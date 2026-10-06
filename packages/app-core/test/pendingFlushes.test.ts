import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { ApiError } from '../src/query/api.js';
import { createVersionedResource } from '../src/query/createVersionedResource.js';
import {
  clearPendingFlushes,
  hasPendingFlushes,
} from '../src/pendingFlushes.js';
import { useVersionedDocEditor } from '../src/useVersionedDocEditor.js';
import { act, renderHook } from './renderHook.js';

type FakeNote = { id: string; body: string; version: number };

const waitUntil = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const setup = () => {
  const store = new Map<string, FakeNote>([
    ['n1', { id: 'n1', body: 'hello', version: 1 }],
  ]);
  const server = {
    offline: false,
    gate: null as Promise<void> | null,
    puts: 0,
  };
  const listeners = new Set<() => void>();
  const signals = {
    subscribe: (retry: () => void) => {
      listeners.add(retry);
      return () => listeners.delete(retry);
    },
    get count() {
      return listeners.size;
    },
    fire: () => {
      for (const retry of [...listeners]) retry();
    },
  };
  const client = {} as ApiClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const resource = createVersionedResource<FakeNote, { id: string }>({
    queryKey: ({ id }) => ['notebook', 'notes', id] as const,
    fetch: async (_c, { id }) => ({ ...store.get(id)! }),
    update: async (_c, { id }, body) => {
      server.puts += 1;
      // The request is still on the wire while gated; the server has not
      // seen it yet.
      if (server.gate) await server.gate;
      if (server.offline) throw new ApiError('Network', 0);
      const prev = store.get(id)!;
      if (body.version !== prev.version) throw new ApiError('Conflict', 409);
      const next = {
        ...prev,
        body: String(body.body ?? prev.body),
        version: prev.version + 1,
      };
      store.set(id, next);
      return next;
    },
    tooLargeMessage: 'Too large.',
    setCache: (qc, entity) => {
      qc.setQueryData(['notebook', 'notes', entity.id], entity);
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, {
        client: queryClient,
        children,
      }),
    });
  const mount = () =>
    renderHook(
      () =>
        useVersionedDocEditor({
          resource,
          params: { id: 'n1' },
          initialDraft: { body: '' },
          toDraft: (n) => ({ body: n.body }),
          getEntityId: (n) => n.id,
          toPayload: (draft) => ({ body: draft.body }),
          conflictMessage: 'Conflict',
          confirm: async () => true,
          retrySignals: signals.subscribe,
        }),
      { wrapper },
    );
  return { store, server, signals, mount };
};

describe('unsaved edits outliving their editor', () => {
  afterEach(() => {
    clearPendingFlushes();
  });

  test('a save that fails at unmount retries on the next signal', async () => {
    const { store, server, signals, mount } = setup();
    const first = mount();
    await waitUntil(() => !first.result.current.isLoading, 'hydrate');

    server.offline = true;
    act(() => {
      first.result.current.updateDraft(() => ({ body: 'offline words' }));
    });
    first.unmount();
    await waitUntil(() => server.puts === 1, 'unmount flush');
    expect(hasPendingFlushes()).toBe(true);
    await waitUntil(() => signals.count > 0, 'waiting for a retry signal');
    expect(store.get('n1')?.body).toBe('hello');

    server.offline = false;
    act(() => {
      signals.fire();
    });
    await waitUntil(() => store.get('n1')?.body === 'offline words', 'retry');
    expect(store.get('n1')?.version).toBe(2);
    await waitUntil(() => !hasPendingFlushes(), 'queue drained');
  });

  test('remounting during the unmount save waits for it instead of hydrating stale text', async () => {
    const { store, server, mount } = setup();
    const first = mount();
    await waitUntil(() => !first.result.current.isLoading, 'hydrate');

    let release!: () => void;
    server.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    act(() => {
      first.result.current.updateDraft(() => ({ body: 'hello world' }));
    });
    first.unmount();
    await waitUntil(() => server.puts === 1, 'unmount flush');

    const second = mount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(second.result.current.isLoading).toBe(true);

    server.gate = null;
    await act(async () => {
      release();
    });
    await waitUntil(() => !second.result.current.isLoading, 'hydrate');
    expect(second.result.current.draft).toEqual({ body: 'hello world' });
    expect(second.result.current.boundVersion).toBe(2);
    expect(second.result.current.dirty).toBe(false);

    act(() => {
      second.result.current.updateDraft(() => ({ body: 'hello world again' }));
    });
    await act(async () => {
      expect(await second.result.current.save()).toBe('clean');
    });
    expect(store.get('n1')).toEqual({
      id: 'n1',
      body: 'hello world again',
      version: 3,
    });
    expect(second.result.current.saveError).toBeNull();
  });

  test('remounting after a failed unmount save resumes the unsaved draft', async () => {
    const { store, server, mount } = setup();
    const first = mount();
    await waitUntil(() => !first.result.current.isLoading, 'hydrate');

    server.offline = true;
    act(() => {
      first.result.current.updateDraft(() => ({ body: 'not yet saved' }));
    });
    first.unmount();
    await waitUntil(() => hasPendingFlushes(), 'queued');

    const second = mount();
    await waitUntil(() => !second.result.current.isLoading, 'hydrate');
    expect(second.result.current.draft).toEqual({ body: 'not yet saved' });
    expect(second.result.current.dirty).toBe(true);
    expect(hasPendingFlushes()).toBe(false);

    server.offline = false;
    await act(async () => {
      expect(await second.result.current.save()).toBe('clean');
    });
    expect(store.get('n1')?.body).toBe('not yet saved');
  });
});
