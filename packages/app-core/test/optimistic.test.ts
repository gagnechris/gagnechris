import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { optimisticMutationHandlers } from '../src/query/optimistic.js';

type Task = { id: string; done: boolean };

const markDone = (tasks: Task[] | undefined, { id }: { id: string }) =>
  tasks?.map((t) => (t.id === id ? { ...t, done: true } : t));

describe('optimisticMutationHandlers (CHR-131)', () => {
  test('applies optimistic update and rolls back on error', async () => {
    const queryClient = new QueryClient();
    const queryKey = ['admin', 'tasks', 'list'] as const;
    const initial: Task[] = [
      { id: 'a', done: false },
      { id: 'b', done: false },
    ];
    queryClient.setQueryData(queryKey, initial);

    const handlers = optimisticMutationHandlers<Task[], { id: string }>({
      queryClient,
      queryKey,
      invalidate: false,
      update: markDone,
    });

    const context = await handlers.onMutate({ id: 'a' });
    expect(queryClient.getQueryData<Task[]>(queryKey)).toEqual([
      { id: 'a', done: true },
      { id: 'b', done: false },
    ]);
    expect(context.previous).toEqual(initial);

    handlers.onError(new Error('fail'), { id: 'a' }, context);
    expect(queryClient.getQueryData<Task[]>(queryKey)).toEqual(initial);
  });
});

describe('optimisticMutationHandlers multi-key (CHR-158)', () => {
  test('updates two lists and rolls both back on error', async () => {
    const queryClient = new QueryClient();
    const todayKey = ['admin', 'today', 'tasks'] as const;
    const listKey = ['admin', 'tasks', 'list'] as const;
    const today: Task[] = [
      { id: 'a', done: false },
      { id: 'b', done: false },
    ];
    const list: Task[] = [
      { id: 'a', done: false },
      { id: 'c', done: false },
    ];
    queryClient.setQueryData(todayKey, today);
    queryClient.setQueryData(listKey, list);

    const handlers = optimisticMutationHandlers<Task[], { id: string }>({
      queryClient,
      invalidate: false,
      targets: [
        { queryKey: todayKey, update: markDone },
        { queryKey: listKey, update: markDone },
      ],
    });

    const context = await handlers.onMutate({ id: 'a' });
    expect(queryClient.getQueryData<Task[]>(todayKey)).toEqual([
      { id: 'a', done: true },
      { id: 'b', done: false },
    ]);
    expect(queryClient.getQueryData<Task[]>(listKey)).toEqual([
      { id: 'a', done: true },
      { id: 'c', done: false },
    ]);
    expect(context.snapshots).toHaveLength(2);

    handlers.onError(new Error('fail'), { id: 'a' }, context);
    expect(queryClient.getQueryData<Task[]>(todayKey)).toEqual(today);
    expect(queryClient.getQueryData<Task[]>(listKey)).toEqual(list);
  });
});
