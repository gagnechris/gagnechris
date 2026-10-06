import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { addDays, localDateString } from '@gagnechris/shared';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookTasksPage from './NotebookTasksPage';

type Task = {
  id: string;
  userId: string;
  area: 'work' | 'personal';
  title: string;
  description: string;
  priority: 'low' | 'med' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'dropped';
  dueDate: string | null;
  startDate: string | null;
  someday: boolean;
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
  created: [] as Record<string, unknown>[],
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (
      path: string,
      init?: {
        params?: {
          query?: {
            status?: string;
            open?: string;
            startOn?: string;
            startAfter?: string;
            someday?: string;
          };
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
                  : q.open !== 'true' ||
                    t.status === 'todo' ||
                    t.status === 'in_progress') &&
                (!q.startOn || t.startDate === q.startOn) &&
                (!q.startAfter ||
                  (t.startDate !== null && t.startDate > q.startAfter)) &&
                (!q.someday || t.someday === (q.someday === 'true')),
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
        state.created.push(body);
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
          startDate: (body.startDate as string | null | undefined) ?? null,
          someday: body.someday === true,
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

function renderTasks(entry = '/tasks') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout user={testAuthUser} />,
        children: [{ path: 'tasks', element: <NotebookTasksPage /> }],
      },
    ],
    { initialEntries: [entry] },
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
    state.created = [];
  });

  test('quick-adds a task and completes it', async () => {
    const user = userEvent.setup();
    renderTasks();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Tasks' }),
      ).toBeInTheDocument();
    });

    const input = screen.getByRole('combobox', { name: 'Quick add task' });
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

  test('quick-add sets the show-on date, and a deadline only from due:', async () => {
    const user = userEvent.setup();
    renderTasks();
    const quickAdd = await screen.findByRole('combobox', {
      name: 'Quick add task',
    });

    await user.type(quickAdd, 'Call bank @tomorrow{Enter}');
    expect(await screen.findByText('Call bank')).toBeInTheDocument();
    expect(state.created).toHaveLength(1);
    expect(state.created[0]?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.created[0]?.dueDate).toBeNull();
    expect(screen.getByText(/shows \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();

    await user.type(quickAdd, 'File taxes due:2099-04-15 {Enter}');
    expect(await screen.findByText('File taxes')).toBeInTheDocument();
    expect(state.created[1]).toMatchObject({
      startDate: null,
      dueDate: '2099-04-15',
    });
    expect(screen.getByText('due Apr 15')).toBeInTheDocument();
  });

  test('120 done past tasks do not hide 3 open tasks', async () => {
    const mk = (
      i: number,
      status: Task['status'],
      startDate: string,
    ): Task => ({
      id: `01TASKPILE${String(i).padStart(16, '0')}`,
      userId: 'u1',
      area: 'work',
      title: status === 'done' ? `old ${i}` : `open ${i}`,
      description: '',
      priority: 'high',
      status,
      dueDate: null,
      startDate,
      someday: false,
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

  test('?show=later lists open tasks after today, and Dropped finds dropped ones', async () => {
    const today = localDateString();
    const mk = (
      i: number,
      title: string,
      startDate: string,
      status: Task['status'] = 'todo',
    ): Task => ({
      id: `01TASKLATER${String(i).padStart(15, '0')}`,
      userId: 'u1',
      area: 'work',
      title,
      description: '',
      priority: 'med',
      status,
      dueDate: null,
      startDate,
      someday: false,
      completedAt: null,
      noteId: null,
      tags: [],
      version: 1,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      deleted: false,
    });
    state.tasks = [
      mk(1, 'Today task', today),
      mk(2, 'Next week task', addDays(today, 7)),
      mk(3, 'Dropped later', addDays(today, 3), 'dropped'),
    ];
    const user = userEvent.setup();
    renderTasks('/tasks?show=later');

    const open = await screen.findByRole('list', { name: 'Open tasks' });
    await waitFor(() => {
      expect(open).toHaveTextContent('Next week task');
    });
    expect(open).not.toHaveTextContent('Today task');
    expect(open).not.toHaveTextContent('Dropped later');
    expect(
      screen.getByRole('combobox', { name: 'Filter by show-on date' }),
    ).toHaveValue('later');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'dropped',
    );
    const dropped = await screen.findByRole('list', { name: 'Dropped tasks' });
    expect(dropped).toHaveTextContent('Dropped later');
    expect(dropped).toHaveTextContent('dropped');
    expect(dropped).not.toHaveTextContent('Next week task');
  });
});
