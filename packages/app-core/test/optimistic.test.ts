import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { optimisticMutationHandlers } from '../src/query/optimistic.js';

type Task = { id: string; done: boolean };

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
      update: (tasks, { id }) =>
        tasks?.map((t) => (t.id === id ? { ...t, done: true } : t)),
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
