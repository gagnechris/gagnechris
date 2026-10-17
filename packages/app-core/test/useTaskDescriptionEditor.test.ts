import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { queryKeys } from '../src/query/keys.js';
import { useTaskDescriptionEditor } from '../src/query/useTaskDescriptionEditor.js';
import type { Task } from '../src/query/api.js';
import { clearPendingFlushes } from '../src/pendingFlushes.js';
import { AUTOSAVE_DEBOUNCE_MS } from '../src/useQueuedAutosave.js';
import { act, renderHook } from './renderHook.js';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: '01ARZ3NDEKTSV4RRFFQ48JMTA1',
  userId: 'u1',
  area: 'work',
  title: 'Renew card',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: null,
  parentId: null,
  tags: [],
  version: 3,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

type Put = (body: Record<string, unknown>) => {
  data?: Task;
  error?: unknown;
  response: { status: number };
};

function setup(put: Put) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const stored = task();
  qc.setQueryData(queryKeys.tasks.detail(stored.id), stored);
  const bodies: Record<string, unknown>[] = [];
  const client = {
    PUT: async (_path: string, init: { body: Record<string, unknown> }) => {
      bodies.push(init.body);
      return put(init.body);
    },
  } as unknown as ApiClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, { client: qc, children }),
    });
  const mount = () =>
    renderHook(
      () =>
        useTaskDescriptionEditor(
          qc.getQueryData<Task>(queryKeys.tasks.detail(stored.id)) ?? stored,
        ),
      { wrapper },
    );
  const { result, unmount } = mount();
  return { qc, result, unmount, mount, bodies, stored };
}

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 50);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  clearPendingFlushes();
  vi.useRealTimers();
});

describe('useTaskDescriptionEditor', () => {
  test('saves only the description, on the cached version', async () => {
    const { result, bodies, qc, stored } = setup((body) => ({
      data: task({ description: String(body.description), version: 4 }),
      response: { status: 200 },
    }));

    act(() => result.current.onChange('Bring the numbers'));
    expect(result.current.dirty).toBe(true);
    await settle();

    expect(bodies).toEqual([{ version: 3, description: 'Bring the numbers' }]);
    expect(
      qc.getQueryData<Task>(queryKeys.tasks.detail(stored.id))?.description,
    ).toBe('Bring the numbers');
    expect(result.current.dirty).toBe(false);
  });

  test('a stale version from another field’s save is written over once', async () => {
    const { result, bodies } = setup((body) =>
      body.version === 3
        ? {
            error: {
              error: 'conflict',
              message: 'conflict',
              current: task({ dueDate: '2026-10-09', version: 4 }),
            },
            response: { status: 409 },
          }
        : {
            data: task({ description: String(body.description), version: 5 }),
            response: { status: 200 },
          },
    );

    act(() => result.current.onChange('Bring the numbers'));
    await settle();

    expect(bodies.map((b) => b.version)).toEqual([3, 4]);
    expect(result.current.saveError).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  test('a description edited on another device is not written over', async () => {
    const { result, bodies } = setup(() => ({
      error: {
        error: 'conflict',
        message: 'conflict',
        current: task({ description: 'From the phone', version: 4 }),
      },
      response: { status: 409 },
    }));

    act(() => result.current.onChange('Bring the numbers'));
    await settle();

    expect(bodies.map((b) => b.version)).toEqual([3]);
    expect(result.current.saveError).toMatch(/another device/);
    expect(result.current.dirty).toBe(true);
  });

  test('closing the details offline keeps sending the last edit, and reopening shows it', async () => {
    let online = false;
    const { result, bodies, unmount, mount, qc, stored } = setup((body) => {
      if (!online) throw new TypeError('Failed to fetch');
      return {
        data: task({ description: String(body.description), version: 4 }),
        response: { status: 200 },
      };
    });
    act(() => result.current.onChange('Bring the numbers'));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(bodies).toHaveLength(1);

    const reopened = mount();
    expect(reopened.result.current.value).toBe('Bring the numbers');
    expect(reopened.result.current.dirty).toBe(true);

    online = true;
    // The in-flight send settles first, then this editor's autosave sends.
    await settle();
    await settle();
    expect(bodies.at(-1)).toEqual({
      version: 3,
      description: 'Bring the numbers',
    });
    expect(
      qc.getQueryData<Task>(queryKeys.tasks.detail(stored.id))?.description,
    ).toBe('Bring the numbers');
    expect(reopened.result.current.dirty).toBe(false);
    expect(reopened.result.current.value).toBe('Bring the numbers');
  });
});
