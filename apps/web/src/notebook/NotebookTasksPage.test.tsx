import { render, screen, waitFor, within } from '@testing-library/react';
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
  parentId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

const state = vi.hoisted(() => ({
  tasks: [] as Task[],
  created: [] as Record<string, unknown>[],
  failCreate: false,
  queries: [] as Record<string, unknown>[],
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
            startBefore?: string;
            someday?: string;
            undated?: string;
            priority?: string;
            limit?: number;
            cursor?: string;
          };
        };
      },
    ) => {
      if (path === '/api/notebook/tasks') {
        // Honour the filters and paging the UI sends, like the API.
        const q = init?.params?.query ?? {};
        state.queries.push(q);
        const matches = state.tasks.filter(
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
            (!q.startBefore ||
              (t.startDate !== null && t.startDate < q.startBefore)) &&
            (!q.someday || t.someday === (q.someday === 'true')) &&
            (!q.undated || (!t.someday && t.startDate === null)) &&
            (!q.priority || t.priority === q.priority),
        );
        const start = Number(q.cursor ?? 0);
        const end = start + (q.limit ?? 50);
        return {
          data: {
            items: matches.slice(start, end),
            nextCursor: end < matches.length ? String(end) : undefined,
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
        // Mirrors the API's title limit.
        if (state.failCreate || String(body.title).length > 300) {
          return {
            data: undefined,
            error: { error: 'bad_request', message: 'Validation failed' },
            response: { status: 400 },
          };
        }
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
          parentId: null,
          tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
          version: 1,
          createdAt: now,
          updatedAt: now,
          deleted: false,
        };
        state.tasks.push(task);
        return { data: task, error: undefined, response: { status: 201 } };
      }
      if (path === '/api/notebook/tasks/batch') {
        const ids = (init?.body?.ids ?? []) as string[];
        return {
          data: {
            items: state.tasks.filter((t) => ids.includes(t.id) && !t.deleted),
          },
          error: undefined,
          response: { status: 200 },
        };
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
    state.failCreate = false;
    state.queries = [];
  });

  test('a subtask shows its parent title above its own, struck through once the parent is done', async () => {
    const base = {
      userId: 'u1',
      area: 'work' as const,
      description: '',
      priority: 'med' as const,
      dueDate: null,
      startDate: null,
      someday: false,
      completedAt: null,
      noteId: 'note-1',
      tags: [],
      version: 1,
      createdAt: '2026-10-02T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
      deleted: false,
    };
    state.tasks = [
      { ...base, id: 'p1', title: 'Launch', status: 'todo', parentId: null },
      {
        ...base,
        id: 's1',
        title: 'Write copy',
        status: 'todo',
        parentId: 'p1',
      },
      { ...base, id: 'p2', title: 'Old plan', status: 'done', parentId: null },
      { ...base, id: 's2', title: 'Leftover', status: 'todo', parentId: 'p2' },
    ];
    renderTasks();

    const row = (title: string) =>
      screen
        .getByRole('checkbox', { name: `Complete ${title}` })
        .closest('li')!;
    await screen.findByText('Write copy');
    await waitFor(() =>
      expect(
        row('Write copy').querySelector('.task-parent-label'),
      ).toHaveTextContent('Launch'),
    );
    await waitFor(() =>
      expect(
        row('Leftover').querySelector('.task-parent-label--finished'),
      ).toHaveTextContent('Old plan'),
    );
    expect(row('Launch').querySelector('.task-parent-label')).toBeNull();
  });

  test('a URL in a title is a link after the title', async () => {
    state.tasks = [
      {
        id: 't1',
        userId: 'u1',
        area: 'work',
        title: 'Read https://example.com/very/long/path before standup',
        description: '',
        priority: 'med',
        status: 'todo',
        dueDate: null,
        startDate: null,
        someday: false,
        completedAt: null,
        noteId: null,
        parentId: null,
        tags: [],
        version: 1,
        createdAt: '2026-10-02T12:00:00.000Z',
        updatedAt: '2026-10-02T12:00:00.000Z',
        deleted: false,
      },
    ];
    renderTasks();

    const row = (
      await screen.findByRole('checkbox', {
        name: 'Complete Read https://example.com/very/long/path before standup',
      })
    ).closest('li')!;
    const link = within(row).getByRole('link', {
      name: /^example\.com/,
    });
    expect(link).toHaveAttribute('href', 'https://example.com/very/long/path');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.closest('a[href="/tasks/t1"]')).toBeNull();
  });

  test('a failed quick add shows an error and keeps the text', async () => {
    state.failCreate = true;
    const user = userEvent.setup();
    renderTasks();
    const input = await screen.findByRole('combobox', {
      name: 'Quick add task',
    });

    await user.type(input, 'Ship API{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add “Ship API”. Please try again.',
    );
    expect(input).toHaveValue('Ship API');
    expect(state.tasks).toHaveLength(0);
  });

  test('quick add truncates an overlong title instead of failing', async () => {
    const user = userEvent.setup();
    renderTasks();
    const input = await screen.findByRole('combobox', {
      name: 'Quick add task',
    });
    const long = 'x'.repeat(350);

    await user.click(input);
    await user.paste(`${long} !high`);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(state.tasks).toHaveLength(1));
    expect(state.tasks[0]).toMatchObject({
      title: 'x'.repeat(300),
      priority: 'high',
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the area chip lists every area by default, narrows to one, and quick add files into the current area', async () => {
    // The sidebar's Today count asks for its own area.
    const listQueries = () =>
      state.queries.filter((q) => !('startOnOrBefore' in q));
    const user = userEvent.setup();
    renderTasks('/tasks?area=work');

    const chip = await screen.findByRole('button', { name: 'Area: All areas' });
    await waitFor(() => expect(listQueries().length).toBeGreaterThan(0));
    expect(listQueries().at(-1)?.area).toBeUndefined();

    await user.click(chip);
    expect(
      screen.getAllByRole('menuitemradio').map((r) => r.textContent),
    ).toEqual(['All areas', 'Work', 'Personal']);
    await user.click(screen.getByRole('menuitemradio', { name: 'Personal' }));
    expect(
      screen.getByRole('button', { name: 'Area: Personal' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/New tasks go to Personal/)).toBeInTheDocument();
    await waitFor(() =>
      expect(listQueries().at(-1)).toMatchObject({ area: 'personal' }),
    );

    await user.click(screen.getByRole('button', { name: 'Area: Personal' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'All areas' }));
    await waitFor(() => expect(listQueries().at(-1)?.area).toBeUndefined());
    await user.type(
      screen.getByRole('combobox', { name: 'Quick add task' }),
      'Call Sam{Enter}',
    );
    await waitFor(() =>
      expect(state.created.at(-1)).toMatchObject({ area: 'personal' }),
    );
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
      parentId: null,
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
      parentId: null,
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

  test('lists an overdue task before one shown tomorrow', async () => {
    const today = localDateString();
    const mk = (
      i: number,
      title: string,
      fields: Pick<Task, 'startDate' | 'dueDate'>,
    ): Task => ({
      id: `01TASKORDER${String(i).padStart(15, '0')}`,
      userId: 'u1',
      area: 'work',
      title,
      description: '',
      priority: 'med',
      status: 'todo',
      someday: false,
      completedAt: null,
      noteId: null,
      parentId: null,
      tags: [],
      version: 1,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      deleted: false,
      ...fields,
    });
    state.tasks = [
      mk(1, 'Shown tomorrow', { startDate: addDays(today, 1), dueDate: null }),
      mk(2, 'Overdue', { startDate: null, dueDate: addDays(today, -1) }),
    ];
    renderTasks();

    const open = await screen.findByRole('list', { name: 'Open tasks' });
    const titles = [...open.querySelectorAll('li')].map((li) => li.textContent);
    expect(titles[0]).toContain('Overdue');
    expect(titles[1]).toContain('Shown tomorrow');
  });

  describe('show-on filters page on the server', () => {
    const today = localDateString();
    const mk = (i: number, startDate: string | null): Task => ({
      id: `01TASKSHOW${String(i).padStart(16, '0')}`,
      userId: 'u1',
      area: 'work',
      title: `task ${i}`,
      description: '',
      priority: 'med',
      status: 'todo',
      dueDate: null,
      startDate,
      someday: false,
      completedAt: null,
      noteId: null,
      parentId: null,
      tags: [],
      version: 1,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      deleted: false,
    });
    const nextYear = addDays(today, 365);

    test.each([
      ['week', today],
      ['earlier', addDays(today, -3)],
      ['none', null],
    ])(
      '?show=%s finds matches beyond the first 50 open tasks',
      async (show, startDate) => {
        state.tasks = [
          ...Array.from({ length: 50 }, (_, i) => mk(i, nextYear)),
          ...[50, 51, 52].map((i) => mk(i, startDate)),
        ];
        renderTasks(`/tasks?show=${show}`);

        const open = await screen.findByRole('list', { name: 'Open tasks' });
        expect(open.querySelectorAll('li')).toHaveLength(3);
        expect(open).toHaveTextContent('task 52');
        expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
      },
    );

    test('a filter with no matches says so', async () => {
      state.tasks = [mk(1, nextYear)];
      renderTasks('/tasks?show=week');
      expect(await screen.findByText('No tasks match.')).toBeInTheDocument();
    });
  });

  test('a filter that spans pages keeps its filter on every Load more', async () => {
    const today = localDateString();
    const mk = (
      i: number,
      priority: Task['priority'],
      status: Task['status'],
    ): Task => ({
      id: `01TASKPAGES${String(i).padStart(15, '0')}`,
      userId: 'u1',
      area: 'work',
      title: `${priority} ${status} ${i}`,
      description: '',
      priority,
      status,
      dueDate: null,
      startDate: today,
      someday: false,
      completedAt: status === 'done' ? '2026-09-01T12:00:00.000Z' : null,
      noteId: null,
      parentId: null,
      tags: [],
      version: 1,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      deleted: false,
    });
    // Low tasks first, so an unfiltered page would be all low.
    state.tasks = [
      ...Array.from({ length: 70 }, (_, i) => mk(i, 'low', 'todo')),
      ...Array.from({ length: 60 }, (_, i) => mk(100 + i, 'high', 'todo')),
      ...Array.from({ length: 55 }, (_, i) => mk(200 + i, 'high', 'dropped')),
      ...Array.from({ length: 52 }, (_, i) => mk(300 + i, 'high', 'done')),
    ];
    const user = userEvent.setup();
    renderTasks();
    const rows = (name: string) =>
      screen.getByRole('list', { name }).querySelectorAll('li');
    const loadMore = () => screen.getByRole('button', { name: 'Load more' });

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Filter by priority' }),
      'high',
    );
    await waitFor(() => expect(rows('Open tasks')).toHaveLength(50));
    await user.click(loadMore());
    await waitFor(() => expect(rows('Open tasks')).toHaveLength(60));
    expect(
      screen.getByRole('list', { name: 'Open tasks' }),
    ).not.toHaveTextContent(/low/);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    const nextPage = state.queries.find((q) => q.cursor === '50');
    expect(nextPage).toMatchObject({ priority: 'high', open: 'true' });

    await user.click(screen.getByText('Completed'));
    expect(await screen.findByText('Completed (50+)')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Load more completed' }),
    );
    expect(await screen.findByText('Completed (52)')).toBeInTheDocument();
    expect(rows('Completed tasks')).toHaveLength(52);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'dropped',
    );
    await waitFor(() => expect(rows('Dropped tasks')).toHaveLength(50));
    await user.click(loadMore());
    await waitFor(() => expect(rows('Dropped tasks')).toHaveLength(55));
    expect(
      state.queries.filter((q) => q.status === 'dropped').map((q) => q.cursor),
    ).toEqual([undefined, '50']);
    expect(
      state.queries
        .filter((q) => q.status === 'dropped')
        .every((q) => q.priority === 'high'),
    ).toBe(true);
  });
});
