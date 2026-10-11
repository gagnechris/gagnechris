import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import { usePatchTaskMutation, type Task } from '@gagnechris/app-core';
import { createTestQueryClient, QueryClientTestProvider } from '../test-utils';
import NotebookTaskPage from './NotebookTaskPage';

const TASK_ID = '01JTASKAAAAAAAAAAAAAAAAAA1';
const NOTE_ID = '01JNOTEAAAAAAAAAAAAAAAAAA1';
const TS = '2026-10-02T12:00:00.000Z';

const api = vi.hoisted(() => ({
  task: null as Task | null,
  failWrites: false,
  failed: 0,
  putVersions: [] as number[],
  noteQueries: [] as Record<string, unknown>[],
}));

type Init = {
  body?: Record<string, unknown>;
  params?: {
    path?: Record<string, string>;
    query?: Record<string, unknown>;
  };
};

const ok = <T,>(data: T, status = 200) => ({
  data,
  error: undefined,
  response: { status },
});
const fail = (status: number, error: string, extra = {}) => ({
  data: undefined,
  error: { error, message: error, ...extra },
  response: { status },
});

const write = async (body: Record<string, unknown>, patch: Partial<Task>) => {
  const prev = api.task!;
  if (api.failWrites) {
    // Long enough for the page to render the optimistic copy first.
    await new Promise((resolve) => setTimeout(resolve, 50));
    api.failed += 1;
    return fail(503, 'unavailable');
  }
  if (body.version !== prev.version) {
    return fail(409, 'conflict', { current: prev });
  }
  api.task = { ...prev, ...patch, version: prev.version + 1 };
  return ok(api.task);
};

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string, init?: Init) => {
      if (path === '/api/notebook/tasks/{id}') return ok(api.task);
      if (path === '/api/notebook/tasks') return ok({ items: [] });
      if (path === '/api/notebook/notes') {
        api.noteQueries.push(init?.params?.query ?? {});
        return ok({ items: [] });
      }
      return fail(404, 'not_found');
    },
    PUT: async (path: string, init?: Init) => {
      const body = init?.body ?? {};
      if (path !== '/api/notebook/tasks/{id}') return fail(404, 'not_found');
      if (!api.failWrites) api.putVersions.push(Number(body.version));
      const { version: _version, ...fields } = body;
      return write(body, fields as Partial<Task>);
    },
    POST: async (path: string, init?: Init) => {
      const body = init?.body ?? {};
      if (path === '/api/notebook/tasks/batch') return ok({ items: [] });
      if (path === '/api/notebook/notes/batch') return ok({ items: [] });
      if (path === '/api/notebook/search') {
        return ok({
          notes: [
            {
              type: 'note',
              id: NOTE_ID,
              area: 'work',
              title: 'Planning',
              snippet: '',
              matches: [],
            },
          ],
          tasks: [],
        });
      }
      if (path === '/api/notebook/tasks/{id}/complete') {
        return write(body, { status: 'done', completedAt: TS });
      }
      if (path === '/api/notebook/tasks/{id}/reopen') {
        return write(body, { status: 'todo', completedAt: null });
      }
      return fail(404, 'not_found');
    },
  }),
}));

function seedTask(overrides: Partial<Task> = {}) {
  api.task = {
    id: TASK_ID,
    userId: 'u1',
    area: 'work',
    title: 'Call Sam',
    description: '',
    priority: 'high',
    status: 'todo',
    dueDate: null,
    startDate: null,
    someday: false,
    completedAt: null,
    noteId: null,
    tags: [],
    version: 3,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
    ...overrides,
  };
}

const SnoozeButton = () => {
  const patch = usePatchTaskMutation();
  return (
    <button
      type="button"
      onClick={() =>
        void patch
          .mutateAsync({
            id: TASK_ID,
            version: api.task!.version,
            patch: { startDate: '2026-10-09' },
          })
          .catch(() => {})
      }
    >
      Snooze
    </button>
  );
};

function renderPage() {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: (
        <>
          <SnoozeButton />
          <Outlet />
        </>
      ),
      children: [{ path: 'tasks/:id', element: <NotebookTaskPage /> }],
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: [`/tasks/${TASK_ID}`],
  });
  render(
    <QueryClientTestProvider queryClient={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

async function editTitleAfterFailure(trigger: string, rolledBack: () => void) {
  const user = userEvent.setup();
  renderPage();
  const title = await screen.findByRole('textbox', { name: 'Title' });

  api.failWrites = true;
  await user.click(screen.getByRole('button', { name: trigger }));
  await waitFor(() => expect(api.failed).toBe(1));
  api.failWrites = false;
  await waitFor(rolledBack);

  await user.clear(title);
  await user.type(title, 'Call Sam back');
  await waitFor(() => expect(api.task?.title).toBe('Call Sam back'), {
    timeout: 4000,
  });
  expect(api.putVersions).toEqual([3]);
  expect(screen.queryByText(/Conflict/)).not.toBeInTheDocument();
}

describe('NotebookTaskPage after a failed write', () => {
  beforeEach(() => {
    api.failWrites = false;
    api.failed = 0;
    api.putVersions = [];
  });

  test('a failed Complete leaves the page on the server version', async () => {
    seedTask();
    await editTitleAfterFailure('Complete', () => {
      expect(screen.getByRole('button', { name: 'Complete' })).toBeVisible();
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
        'todo',
      );
    });
  });

  test('a failed Reopen leaves the page on the server version', async () => {
    seedTask({ status: 'done', completedAt: TS });
    await editTitleAfterFailure('Reopen', () => {
      expect(screen.getByRole('button', { name: 'Reopen' })).toBeVisible();
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
        'done',
      );
    });
  });

  test('a failed patch leaves the page on the server version', async () => {
    seedTask();
    await editTitleAfterFailure('Snooze', () =>
      expect(document.querySelector('input[type="date"]')).toHaveValue(''),
    );
  });
});

describe('NotebookTaskPage notes', () => {
  beforeEach(() => {
    api.failWrites = false;
    api.putVersions = [];
    api.noteQueries = [];
  });

  test('reads only the notes that embed the task', async () => {
    seedTask();
    renderPage();
    await screen.findByText('No note embeds this task yet.');
    expect(api.noteQueries.length).toBeGreaterThan(0);
    expect(api.noteQueries.every((q) => q.taskId === TASK_ID)).toBe(true);
  });

  test('links a note found by search', async () => {
    const user = userEvent.setup();
    seedTask();
    renderPage();
    const picker = await screen.findByRole('combobox', { name: 'Linked note' });
    await user.type(picker, 'Plan');
    await user.click(await screen.findByRole('option', { name: /Planning/ }));
    await waitFor(() => expect(api.task?.noteId).toBe(NOTE_ID), {
      timeout: 4000,
    });
  });
});
