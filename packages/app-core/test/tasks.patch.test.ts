import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { queryKeys } from '../src/query/keys.js';
import { applyTaskPatch, usePatchTaskMutation } from '../src/query/tasks.js';
import type { Task } from '../src/query/api.js';
import { act, renderHook } from './renderHook.js';

const TODAY = '2026-10-02';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: '01ARZ3NDEKTSV4RRFFQ48JMTA1',
  userId: 'u1',
  area: 'work',
  title: 'Renew card',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: '2026-09-28',
  someday: false,
  completedAt: null,
  noteId: null,
  tags: [],
  version: 3,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

const todayKey = queryKeys.tasks.list({
  area: 'work',
  open: true,
  startOnOrBefore: TODAY,
  today: TODAY,
});
const upcomingKey = queryKeys.tasks.list({
  area: 'work',
  open: true,
  startAfter: TODAY,
  today: TODAY,
});
const droppedKey = queryKeys.tasks.list({ area: 'work', status: 'dropped' });

const ids = (qc: QueryClient, key: readonly unknown[]) =>
  qc
    .getQueryData<{ pages: { items: Task[] }[] }>(key)
    ?.pages.flatMap((p) => p.items.map((t) => t.id));

function setup(put: (body: Record<string, unknown>) => Promise<unknown>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const pages = (items: Task[]) => ({
    pages: [{ items }],
    pageParams: [undefined],
  });
  qc.setQueryData(todayKey, pages([task()]));
  qc.setQueryData(upcomingKey, pages([]));
  qc.setQueryData(droppedKey, pages([]));
  const client = {
    PUT: async (_path: string, init: { body: Record<string, unknown> }) =>
      put(init.body),
  } as unknown as ApiClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, { client: qc, children }),
    });
  const { result } = renderHook(() => usePatchTaskMutation(), { wrapper });
  return { qc, result };
}

const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('usePatchTaskMutation', () => {
  test('snooze moves the task out of Today and into Upcoming before the server answers', async () => {
    const gate = deferred();
    const { qc, result } = setup(async (body) => {
      await gate.promise;
      return {
        data: task({ startDate: body.startDate as string, version: 4 }),
        response: { status: 200 },
      };
    });

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.mutateAsync({
        id: task().id,
        version: 3,
        patch: { startDate: '2026-10-05' },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(ids(qc, todayKey)).toEqual([]);
    expect(ids(qc, upcomingKey)).toEqual([task().id]);

    gate.resolve(undefined);
    await act(async () => {
      await done;
    });
    expect(
      qc.getQueryData<Task>(queryKeys.tasks.detail(task().id)),
    ).toMatchObject({ startDate: '2026-10-05', version: 4 });
  });

  test('drop removes the task from open lists and adds it to the dropped list', async () => {
    const gate = deferred();
    const { qc, result } = setup(async () => {
      await gate.promise;
      return {
        data: task({ status: 'dropped', version: 4 }),
        response: { status: 200 },
      };
    });
    act(() => {
      void result.current.mutateAsync({
        id: task().id,
        version: 3,
        patch: { status: 'dropped' },
      });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(ids(qc, todayKey)).toEqual([]);
    expect(ids(qc, upcomingKey)).toEqual([]);
    expect(ids(qc, droppedKey)).toEqual([task().id]);
    gate.resolve(undefined);
  });

  test('a failed patch puts every list back and leaves no optimistic detail', async () => {
    const { qc, result } = setup(async () => ({
      data: undefined,
      error: { error: 'version_conflict', message: 'Conflict' },
      response: { status: 409 },
    }));
    await act(async () => {
      await result.current
        .mutateAsync({
          id: task().id,
          version: 3,
          patch: { status: 'dropped' },
        })
        .catch(() => {});
    });
    expect(ids(qc, todayKey)).toEqual([task().id]);
    expect(ids(qc, droppedKey)).toEqual([]);
    expect(
      qc.getQueryData<Task>(queryKeys.tasks.detail(task().id)),
    ).toBeUndefined();
  });
});

describe('applyTaskPatch', () => {
  test('applies title, priority and deadline, keeping fields it omits', () => {
    const next = applyTaskPatch(task({ dueDate: '2026-10-09' }), {
      title: 'Renew card today',
      priority: 'high',
    });
    expect(next).toMatchObject({
      title: 'Renew card today',
      priority: 'high',
      dueDate: '2026-10-09',
      startDate: '2026-09-28',
      version: 4,
    });
    expect(applyTaskPatch(next, { dueDate: null }).dueDate).toBeNull();
  });
});
