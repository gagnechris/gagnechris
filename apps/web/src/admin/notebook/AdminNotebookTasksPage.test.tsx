import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider } from '../../test-utils';
import AdminNotebookLayout from '../AdminNotebookLayout';
import AdminNotebookTasksPage from './AdminNotebookTasksPage';

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

vi.mock('../../api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) => {
      if (path === '/api/notebook/tasks') {
        return {
          data: { items: state.tasks.filter((t) => !t.deleted) },
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
        path: '/admin/notebook',
        element: <AdminNotebookLayout />,
        children: [{ path: 'tasks', element: <AdminNotebookTasksPage /> }],
      },
    ],
    { initialEntries: ['/admin/notebook/tasks'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('AdminNotebookTasksPage (CHR-44)', () => {
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
    expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
  });
});
