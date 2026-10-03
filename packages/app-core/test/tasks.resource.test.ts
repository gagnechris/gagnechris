import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { setCachedTask } from '../src/query/cache.js';
import { queryKeys } from '../src/query/keys.js';
import type { Task } from '../src/query/api.js';

const sample = (overrides: Partial<Task> = {}): Task => ({
  id: '01ARZ3NDEKTSV4RRFFQ48JMTA1',
  userId: 'u1',
  area: 'work',
  title: 'Ship',
  description: '',
  priority: 'high',
  status: 'todo',
  dueDate: '2026-10-01',
  completedAt: null,
  noteId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('setCachedTask', () => {
  test('writes detail and upserts into list pages', () => {
    const qc = new QueryClient();
    const listKey = queryKeys.tasks.list({ area: 'work' });
    qc.setQueryData(listKey, {
      pages: [{ items: [] }],
      pageParams: [undefined],
    });

    const task = sample();
    setCachedTask(qc, task);

    expect(qc.getQueryData<Task>(queryKeys.tasks.detail(task.id))).toEqual(
      task,
    );
    const list = qc.getQueryData<{ pages: { items: Task[] }[] }>(listKey);
    expect(list?.pages[0]?.items).toEqual([task]);

    setCachedTask(qc, { ...task, title: 'Shipped', version: 2 });
    expect(qc.getQueryData<Task>(queryKeys.tasks.detail(task.id))?.title).toBe(
      'Shipped',
    );
  });
});
