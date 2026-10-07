import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import type { Task } from '../src/query/api.js';
import { useCreateTaskMutation, useTasksQuery } from '../src/query/tasks.js';
import { act, renderHook } from './renderHook.js';

const created: Task = {
  id: '01ARZ3NDEKTSV4RRFFQ48JMTA1',
  userId: 'u1',
  area: 'personal',
  title: 'Errand',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  deleted: false,
};

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

test('a task created while a list is still loading for the first time shows up in it', async () => {
  const stored: Task[] = [];
  let answerFirst: ((items: Task[]) => void) | undefined;
  const page = (items: Task[]) => ({
    data: { items, nextCursor: null },
    response: { status: 200 },
  });
  const client = {
    GET: vi.fn(() =>
      answerFirst
        ? Promise.resolve(page([...stored]))
        : new Promise((resolve) => {
            answerFirst = (items) => resolve(page(items));
          }),
    ),
    POST: async () => {
      stored.push(created);
      return { data: created, response: { status: 201 } };
    },
  } as unknown as ApiClient;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, { client: qc, children }),
    });
  const { result } = renderHook(
    () => ({
      list: useTasksQuery({ area: 'personal', open: true }),
      create: useCreateTaskMutation(),
    }),
    { wrapper },
  );
  await settle();
  expect(client.GET).toHaveBeenCalledTimes(1);

  await act(async () => {
    await result.current.create.mutateAsync({
      id: created.id,
      area: 'personal',
      title: created.title,
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    });
  });
  // The list GET that started before the POST answers with the old rows.
  answerFirst!([]);
  await vi.waitFor(async () => {
    await settle();
    expect(
      result.current.list.data?.pages.flatMap((p) => p.items.map((t) => t.id)),
    ).toEqual([created.id]);
  });
});
