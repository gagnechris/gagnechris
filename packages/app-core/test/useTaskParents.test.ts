import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { expect, test } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { setCachedTask } from '../src/query/cache.js';
import { useTaskParents } from '../src/query/tasks.js';
import type { Task } from '../src/query/api.js';
import { act, renderHook } from './renderHook.js';

const PARENT = '01ARZ3NDEKTSV4RRFFQ48JMTA1';

const parent = (overrides: Partial<Task> = {}): Task => ({
  id: PARENT,
  userId: 'u1',
  area: 'work',
  title: 'Plan offsite',
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
  version: 1,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

test('the parents map stays the same object until a parent changes', async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  setCachedTask(qc, parent());
  const client = {
    POST: async () => ({
      data: { items: [parent()] },
      response: { status: 200 },
    }),
    GET: async () => ({ data: parent(), response: { status: 200 } }),
  } as unknown as ApiClient;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, { client: qc, children }),
    });
  const tasks = [{ parentId: PARENT }];
  const { result, rerender } = renderHook(() => useTaskParents(tasks), {
    wrapper,
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const first = result.current;
  expect(first.get(PARENT)?.title).toBe('Plan offsite');

  rerender();
  expect(result.current).toBe(first);

  await act(async () => {
    setCachedTask(qc, parent({ title: 'Plan retreat', version: 2 }));
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(result.current.get(PARENT)?.title).toBe('Plan retreat');
  expect(result.current).not.toBe(first);
});
