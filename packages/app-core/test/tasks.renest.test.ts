import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { queryKeys } from '../src/query/keys.js';
import { refetchRenestedTasks } from '../src/query/tasks.js';
import type { Task } from '../src/query/api.js';

const NOTE = '01ARZ3NDEKTSV4RRFFQ48JMN01';
const PARENT = '01ARZ3NDEKTSV4RRFFQ48JMTA1';
const CHILD = '01ARZ3NDEKTSV4RRFFQ48JMTA2';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  userId: 'u1',
  area: 'work',
  title: id,
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: NOTE,
  parentId: null,
  tags: [],
  version: 1,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

function setup(child: Task) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.tasks.detail(PARENT), task(PARENT));
  queryClient.setQueryData(queryKeys.tasks.detail(CHILD), child);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  return { queryClient, invalidate };
}

const body = `{{task:${PARENT}}}\n  {{task:${CHILD}}}`;

describe('refetchRenestedTasks', () => {
  test('refetches tasks when a saved note nests one its cache has unnested', async () => {
    const { queryClient, invalidate } = setup(task(CHILD));
    refetchRenestedTasks(queryClient, { id: NOTE, bodyMarkdown: body });
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  test('leaves the cache alone when parents match, or the note is not the task’s home', async () => {
    const { queryClient, invalidate } = setup(
      task(CHILD, { parentId: PARENT }),
    );
    refetchRenestedTasks(queryClient, { id: NOTE, bodyMarkdown: body });
    refetchRenestedTasks(queryClient, {
      id: '01ARZ3NDEKTSV4RRFFQ48JMN02',
      bodyMarkdown: `{{task:${CHILD}}}`,
    });
    await Promise.resolve();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
