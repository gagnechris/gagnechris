import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookTasksPage from './NotebookTasksPage';

type Task = {
  id: string;
  userId: string;
  area: 'work' | 'personal';
  title: string;
  description: string;
  priority: 'low' | 'med' | 'high';
  status: 'todo' | 'in_progress' | 'done';
  dueDate: string | null;
  completedAt: string | null;
  noteId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

const state = vi.hoisted(() => ({
  tasks: [] as Task[],
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (
      path: string,
      init?: {
        params?: {
          query?: { status?: string; open?: string; dueOn?: string };
        };
      },
    ) => {
      if (path === '/api/notebook/tasks') {
        // Honour the filters the UI sends, like the API.
        const q = init?.params?.query ?? {};
        return {
          data: {
            items: state.tasks.filter(
              (t) =>
                !t.deleted &&
                (q.status
                  ? t.status === q.status
                  : q.open !== 'true' || t.status !== 'done') &&
                (!q.dueOn || t.dueDate === q.dueOn),
            ),
          },
          error: undefined,
          response: { status: 200 },
        };
      }
      return {
        data: undefined,
        error: { error: 'not_found' },
        response: { status: 404 },
      };
    },
    POST: async (
      path: string,
      init?: {
        body?: Record<string, unknown>;
        params?: { path?: { id?: string } };
      },
    ) => {
      if (path === '/api/notebook/tasks') {
        const body = init?.body ?? {};
        const now = '2026-10-02T12:00:00.000Z';
        const task: Task = {
          id: String(body.id),
          userId: 'u1',
          area: (body.area as Task['area']) ?? 'work',
          title: String(body.title),
          description: String(body.description ?? ''),
          priority: (body.priority as Task['priority']) ?? 'med',
          status: (body.status as Task['status']) ?? 'todo',
          dueDate: (body.dueDate as string | null | undefined) ?? null,
          completedAt: null,
          noteId: (body.noteId as string | null | undefined) ?? null,
          tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
          version: 1,
          createdAt: now,
          updatedAt: now,
          deleted: false,
        };
        state.tasks.push(task);
        return { data: task, error: undefined, response: { status: 201 } };
      }
      if (path === '/api/notebook/tasks/{id}/complete') {
        const id = init?.params?.path?.id;
        const task = state.tasks.find((t) => t.id === id);
        if (!task) {
          return {
            data: undefined,
            error: { error: 'not_found' },
            response: { status: 404 },
          };
        }
        task.status = 'done';
        task.completedAt = '2026-10-02T12:00:00.000Z';
        task.version += 1;
        return {
          data: { ...task },
          error: undefined,
          response: { status: 200 },
        };
      }
      if (path === '/api/notebook/tasks/{id}/reopen') {
        const id = init?.params?.path?.id;
        const task = state.tasks.find((t) => t.id === id);
        if (!task) {
          return {
            data: undefined,
            error: { error: 'not_found' },
            response: { status: 404 },
          };
        }
        task.status = 'todo';
        task.completedAt = null;
        task.version += 1;
        return {
          data: { ...task },
          error: undefined,
          response: { status: 200 },
        };
      }
      return {
        data: undefined,
        error: { error: 'not_found' },
        response: { status: 404 },
      };
    },
  }),
}));

function renderTasks() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout />,
        children: [{ path: 'tasks', element: <NotebookTasksPage /> }],
      },
    ],
    { initialEntries: ['/tasks'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('NotebookTasksPage', () => {
  beforeEach(() => {
    localStorage.clear();
    state.tasks = [];
  });

  test('quick-adds a task and completes it', async () => {
    const user = userEvent.setup();
    renderTasks();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Tasks' }),
      ).toBeInTheDocument();
    });

    const input = screen.getByRole('textbox', { name: 'Quick add task' });
    await user.type(input, 'Ship API !high{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Ship API')).toBeInTheDocument();
    });
    expect(state.tasks[0]?.priority).toBe('high');

    await user.click(
      screen.getByRole('checkbox', { name: 'Complete Ship API' }),
    );

    await waitFor(() => {
      expect(state.tasks[0]?.status).toBe('done');
    });
    // Completed loads lazily when expanded.
    await user.click(screen.getByText('Completed'));
    expect(await screen.findByText(/Completed \(1\)/)).toBeInTheDocument();
  });

  test('120 done past-due tasks do not hide 3 open tasks', async () => {
    const mk = (i: number, status: Task['status'], dueDate: string): Task => ({
      id: `01TASKPILE${String(i).padStart(16, '0')}`,
      userId: 'u1',
      area: 'work',
      title: status === 'done' ? `old ${i}` : `open ${i}`,
      description: '',
      priority: 'high',
      status,
      dueDate,
      completedAt: status === 'done' ? '2026-09-01T12:00:00.000Z' : null,
      noteId: null,
      tags: [],
      version: 1,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      deleted: false,
    });
    state.tasks = [
      ...Array.from({ length: 120 }, (_, i) => mk(i, 'done', '2026-09-01')),
      ...[0, 1, 2].map((i) => mk(200 + i, 'todo', '2026-10-02')),
    ];
    renderTasks();

    const open = await screen.findByRole('list', { name: 'Open tasks' });
    expect(open.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByText('old 0')).not.toBeInTheDocument();
  });
});
