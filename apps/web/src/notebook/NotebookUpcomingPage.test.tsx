import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  isOpenTaskStatus,
  taskMatchesSchedule,
  type Note,
  type Task,
} from '@gagnechris/shared';
import { addLocalDays, localToday } from '../kit/calendarDates';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookTodayPage from './NotebookTodayPage';
import NotebookUpcomingPage from './NotebookUpcomingPage';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';

const server = vi.hoisted(() => ({
  notes: new Map<string, Note>(),
  tasks: new Map<string, Task>(),
  created: [] as Record<string, unknown>[],
}));

vi.mock('../kit/markdown/MarkdownEditor', () => ({
  default: ({ label = 'Markdown' }: { label?: string }) => (
    <textarea aria-label={label} readOnly />
  ),
}));

const ok = (data: unknown) => ({
  data,
  error: undefined,
  response: { status: 200 },
});
const notFound = () => ({
  data: undefined,
  error: { error: 'not_found' },
  response: { status: 404 },
});

type Init = {
  params?: {
    path?: Record<string, string>;
    query?: Record<string, string | number | undefined>;
  };
  body?: Record<string, unknown>;
};

/** Pages like the API: `limit` per page, cursor is the next offset. */
const listTasks = (q: Record<string, string | number | undefined>) => {
  const all = [...server.tasks.values()]
    .filter(
      (t) =>
        !t.deleted &&
        (!q.area || t.area === q.area) &&
        (q.open !== 'true' || isOpenTaskStatus(t.status)) &&
        taskMatchesSchedule(t, {
          startOnOrBefore: q.startOnOrBefore as string | undefined,
          startAfter: q.startAfter as string | undefined,
          someday: q.someday === undefined ? undefined : q.someday === 'true',
        }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const start = Number(q.cursor ?? 0);
  const limit = Number(q.limit ?? 50);
  const end = start + limit;
  return {
    items: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : undefined,
  };
};

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (path: string, init?: Init) => {
        const p = init?.params?.path ?? {};
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          return ok({
            exists: false,
            userId: 'u1',
            area: p.area,
            type: 'daily',
            date: p.date,
            title: '',
            bodyMarkdown: '',
            tags: [],
            pinned: false,
            version: 0,
          });
        }
        if (path === '/api/notebook/notes/{id}') {
          const note = server.notes.get(p.id!);
          return note ? ok(note) : notFound();
        }
        if (path === '/api/notebook/tasks') {
          return ok(listTasks(init?.params?.query ?? {}));
        }
        return notFound();
      },
      PUT: async (path: string, init?: Init) => {
        if (path !== '/api/notebook/tasks/{id}') return notFound();
        const prev = server.tasks.get(init!.params!.path!.id!)!;
        const body = init!.body!;
        const next: Task = {
          ...prev,
          startDate: (body.startDate as string | undefined) ?? prev.startDate,
          someday: body.someday === true,
          version: prev.version + 1,
        };
        server.tasks.set(next.id, next);
        return ok(next);
      },
      POST: async (path: string, init?: Init) => {
        if (path !== '/api/notebook/tasks') return notFound();
        server.created.push(init!.body!);
        const created: Task = {
          ...task(0, {}),
          ...(init!.body as Partial<Task>),
          version: 1,
        };
        server.tasks.set(created.id, created);
        return ok(created);
      },
    }),
}));

const ULID = (n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69G5T${String(n).padStart(3, '0')}`;

function task(n: number, overrides: Partial<Task>): Task {
  return {
    id: ULID(n),
    userId: 'u1',
    area: 'work',
    title: `Task ${n}`,
    description: '',
    priority: 'med',
    status: 'todo',
    dueDate: null,
    startDate: null,
    someday: false,
    completedAt: null,
    noteId: null,
    tags: [],
    version: 1,
    createdAt: '2026-10-01T14:00:00.000Z',
    updatedAt: '2026-10-01T14:00:00.000Z',
    deleted: false,
    ...overrides,
  };
}

const addTask = (t: Task) => server.tasks.set(t.id, t);

function renderNotebook(path = '/upcoming') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout user={testAuthUser} />,
        children: [
          { path: 'today', element: <NotebookTodayPage /> },
          { path: 'upcoming', element: <NotebookUpcomingPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

const group = (name: string) =>
  screen.getByRole('region', { name: new RegExp(`^${name}`) });

describe('NotebookUpcomingPage', () => {
  const today = localToday();

  beforeEach(() => {
    server.notes.clear();
    server.tasks.clear();
    server.created.length = 0;
    localStorage.clear();
  });

  test('lists every scheduled and parked task once, across pages', async () => {
    addTask(
      task(1, { title: 'Tomorrow task', startDate: addLocalDays(today, 1) }),
    );
    addTask(task(2, { title: 'Parked', someday: true }));
    addTask(task(3, { title: 'Showing now', startDate: today }));
    addTask(
      task(4, {
        title: 'Closed',
        startDate: addLocalDays(today, 2),
        status: 'done',
      }),
    );
    addTask(
      task(5, {
        title: 'Home errand',
        startDate: addLocalDays(today, 1),
        area: 'personal',
      }),
    );
    for (let n = 100; n < 260; n++) {
      addTask(
        task(n, { title: `Later ${n}`, startDate: addLocalDays(today, 30) }),
      );
    }
    const note: Note = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5N01',
      userId: 'u1',
      area: 'work',
      type: 'page',
      date: null,
      title: 'Trip plans',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
      taskIds: [],
      version: 1,
      createdAt: '2026-10-01T13:00:00.000Z',
      updatedAt: '2026-10-01T13:00:00.000Z',
      deleted: false,
    };
    server.notes.set(note.id, note);
    addTask(task(6, { title: 'From a page', someday: true, noteId: note.id }));

    renderNotebook();

    await waitFor(() =>
      expect(within(group('Later')).getAllByRole('listitem')).toHaveLength(160),
    );
    expect(
      within(group('Tomorrow'))
        .getAllByRole('listitem')
        .map((li) => li.dataset.taskId),
    ).toEqual([ULID(1)]);
    expect(
      within(group('Someday'))
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['From a page', 'Trip plans', 'Parked']);
    for (const title of ['Showing now', 'Closed', 'Home errand']) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });

  test('Do today moves the task to Today’s Still open without a reload', async () => {
    const user = userEvent.setup();
    addTask(
      task(1, { title: 'Book flights', startDate: addLocalDays(today, 3) }),
    );
    addTask(task(2, { title: 'Learn piano', someday: true }));

    renderNotebook();
    await user.click(
      await screen.findByRole('button', { name: 'Do “Book flights” today' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Do “Learn piano” today' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Book flights')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Learn piano')).not.toBeInTheDocument();
    expect(server.tasks.get(ULID(2))).toMatchObject({
      startDate: today,
      someday: false,
    });

    await user.click(screen.getByRole('link', { name: /^Today/ }));
    const stillOpen = await screen.findByTestId('still-open');
    expect(
      await within(stillOpen).findByText('Book flights'),
    ).toBeInTheDocument();
    expect(within(stillOpen).getByText('Learn piano')).toBeInTheDocument();
  });

  test('quick add parses the date and says when a task lands on Today instead', async () => {
    const user = userEvent.setup();
    renderNotebook();
    const input = await screen.findByRole('combobox', {
      name: 'Schedule a task',
    });

    await user.type(input, 'Renew passport @someday');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      await within(group('Someday')).findByText('Renew passport'),
    ).toBeInTheDocument();
    expect(server.created[0]).toMatchObject({
      title: 'Renew passport',
      someday: true,
      area: 'work',
    });

    await user.type(input, 'Call mom');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      await screen.findByText(
        '“Call mom” has no later date, so it shows on Today.',
      ),
    ).toBeInTheDocument();
  });
});
