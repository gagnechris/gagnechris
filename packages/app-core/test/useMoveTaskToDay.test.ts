import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import { queryKeys } from '../src/query/keys.js';
import type { Note, Task } from '../src/query/api.js';
import { useMoveTaskToDay } from '../src/query/useMoveTaskToDay.js';
import { renderHook } from './renderHook.js';

const FROM = '01JNOTEFROMAAAAAAAAAAAAAAA';
const DAY = '01JNOTEDAYAAAAAAAAAAAAAAAA';
const A = '01JTASKAAAAAAAAAAAAAAAAAAA';
const B = '01JTASKBBBBBBBBBBBBBBBBBBB';
const DATE = '2026-10-03';
const embed = (id: string) => `{{task:${id}}}`;

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  userId: 'u1',
  area: 'work',
  title: id === A ? 'Plan' : 'Book',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: '2026-10-02',
  someday: false,
  completedAt: null,
  noteId: FROM,
  parentId: null,
  tags: [],
  version: 3,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

const note = (id: string, bodyMarkdown: string, version = 1): Note => ({
  id,
  userId: 'u1',
  area: 'work',
  type: 'daily',
  date: id === DAY ? DATE : '2026-10-02',
  title: '',
  bodyMarkdown,
  tags: [],
  pinned: false,
  taskIds: [],
  version,
  createdAt: '2026-09-28T12:00:00.000Z',
  updatedAt: '2026-09-28T12:00:00.000Z',
  deleted: false,
});

type Reply = { data?: unknown; error?: unknown; response: { status: number } };
const ok = (data: unknown): Reply => ({ data, response: { status: 200 } });

function setup({
  day = note(DAY, 'agenda'),
  from = note(FROM, `top\n${embed(A)}\n  ${embed(B)}\nend`),
  failTask,
  onDayGet,
}: {
  day?: Note;
  from?: Note;
  failTask?: string;
  onDayGet?: () => void;
} = {}) {
  const server = { day, from, taskPuts: [] as string[] };
  const client = {
    GET: async (path: string) => {
      if (path === '/api/notebook/notes/daily/{area}/{date}') {
        onDayGet?.();
        return ok(server.day);
      }
      return ok(server.from);
    },
    PUT: async (
      path: string,
      init: {
        params: { path: { id?: string } };
        body: Record<string, unknown>;
      },
    ): Promise<Reply> => {
      if (path === '/api/notebook/tasks/{id}') {
        const id = init.params.path.id!;
        server.taskPuts.push(id);
        if (id === failTask) {
          return {
            error: { error: 'conflict', message: 'conflict' },
            response: { status: 409 },
          };
        }
        return ok(task(id, { ...init.body, version: 4 } as Partial<Task>));
      }
      const body = String(init.body.bodyMarkdown);
      if (path === '/api/notebook/notes/{id}') {
        server.from = note(FROM, body, server.from.version + 1);
        return ok(server.from);
      }
      server.day = note(DAY, body, server.day.version + 1);
      return ok(server.day);
    },
  } as unknown as ApiClient;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const id of [A, B])
    qc.setQueryData(queryKeys.tasks.detail(id), task(id));
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, { client: qc, children }),
    });
  const { result } = renderHook(() => useMoveTaskToDay(), { wrapper });
  return { server, move: result.current };
}

const block = `${embed(A)}\n  ${embed(B)}`;

describe('useMoveTaskToDay', () => {
  test('takes the lines out of the old note when a task patch fails, and reports it', async () => {
    const { server, move } = setup({ failTask: B });
    const removed: string[] = [];
    const result = await move({
      area: 'work',
      date: DATE,
      fromNoteId: FROM,
      task: task(A),
      readLines: () => block,
      removeLines: () => {
        removed.push('editor');
        return true;
      },
    });

    expect(server.day.bodyMarkdown).toBe(`agenda\n\n${block}\n\n`);
    expect(removed).toEqual(['editor']);
    expect(result?.patchError).toBeTruthy();
    expect(server.taskPuts.sort()).toEqual([A, B]);
  });

  test('moves the lines as they are when the day is saved, not when the move began', async () => {
    let lines = embed(A);
    const { server, move } = setup({
      onDayGet: () => {
        lines = `${embed(A)}\n  typed meanwhile`;
      },
    });
    await move({
      area: 'work',
      date: DATE,
      fromNoteId: FROM,
      task: task(A),
      readLines: () => lines,
      removeLines: () => true,
    });

    expect(server.day.bodyMarkdown).toBe(
      `agenda\n\n${embed(A)}\n  typed meanwhile\n\n`,
    );
  });

  test('moving again does not add the task to the day a second time', async () => {
    const { server, move } = setup({
      day: note(DAY, `agenda\n\n${block}\n\n`, 2),
    });
    const result = await move({
      area: 'work',
      date: DATE,
      fromNoteId: FROM,
      task: task(A),
      readLines: () => block,
      removeLines: () => true,
    });

    expect(server.day.version).toBe(2);
    expect(server.day.bodyMarkdown).toBe(`agenda\n\n${block}\n\n`);
    expect(result?.note.id).toBe(DAY);
  });

  test('saves the old note without the lines when its editor is gone', async () => {
    const { server, move } = setup();
    const result = await move({
      area: 'work',
      date: DATE,
      fromNoteId: FROM,
      task: task(A),
      readLines: () => block,
      removeLines: () => false,
    });

    expect(server.from.bodyMarkdown).toBe('top\nend');
    expect(result?.patchError).toBeNull();
  });
});
