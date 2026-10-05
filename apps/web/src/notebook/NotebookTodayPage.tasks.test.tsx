import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  isOpenTaskStatus,
  taskMatchesSchedule,
  type Note,
  type Task,
} from '@gagnechris/shared';
import { QueryClientTestProvider } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookTodayPage from './NotebookTodayPage';

// Local midnight here is 04:00 UTC, so a UTC "today" would be a day ahead
// for the last hours of every local day.
process.env.TZ = 'America/New_York';

const server = vi.hoisted(() => ({
  notes: new Map<string, Note>(),
  tasks: new Map<string, Task>(),
  writes: [] as { method: string; path: string; body: unknown }[],
  /** Holds each task PUT until released. */
  putGate: null as null | Promise<void>,
}));

vi.mock('../kit/markdown/MarkdownEditor', () => ({
  default: ({
    value,
    onChange,
    label = 'Markdown',
  }: {
    value: string;
    onChange: (value: string) => void;
    label?: string;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
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
    query?: Record<string, string | undefined>;
  };
  body?: Record<string, unknown>;
};

const listTasks = (q: Record<string, string | undefined>) =>
  [...server.tasks.values()].filter(
    (t) =>
      !t.deleted &&
      (!q.area || t.area === q.area) &&
      (q.status
        ? t.status === q.status
        : q.open !== 'true' || isOpenTaskStatus(t.status)) &&
      taskMatchesSchedule(t, {
        startOnOrBefore: q.startOnOrBefore,
        startAfter: q.startAfter,
        startOn: q.startOn,
      }),
  );

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string, init?: Init) => {
      const p = init?.params?.path ?? {};
      if (path === '/api/notebook/notes/daily/{area}/{date}') {
        const note = [...server.notes.values()].find(
          (n) => n.type === 'daily' && n.area === p.area && n.date === p.date,
        );
        return ok(
          note ?? {
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
          },
        );
      }
      if (path === '/api/notebook/notes/{id}') {
        const note = server.notes.get(p.id!);
        return note ? ok(note) : notFound();
      }
      if (path === '/api/notebook/notes') return ok({ items: [] });
      if (path === '/api/notebook/tasks') {
        return ok({ items: listTasks(init?.params?.query ?? {}) });
      }
      if (path === '/api/notebook/tasks/{id}') {
        const task = server.tasks.get(p.id!);
        return task ? ok(task) : notFound();
      }
      return notFound();
    },
    PUT: async (path: string, init?: Init) => {
      server.writes.push({ method: 'PUT', path, body: init?.body });
      if (path === '/api/notebook/tasks/{id}') {
        if (server.putGate) await server.putGate;
        const prev = server.tasks.get(init!.params!.path!.id!)!;
        const body = init!.body!;
        if (body.version !== prev.version) {
          return {
            data: undefined,
            error: { error: 'version_conflict', message: 'Conflict' },
            response: { status: 409 },
          };
        }
        const next: Task = {
          ...prev,
          ...(body.status ? { status: body.status as Task['status'] } : {}),
          ...('startDate' in body
            ? { startDate: body.startDate as string, someday: false }
            : {}),
          ...(body.someday ? { someday: true, startDate: null } : {}),
          version: prev.version + 1,
        };
        server.tasks.set(next.id, next);
        return ok(next);
      }
      return notFound();
    },
    POST: async (path: string, init?: Init) => {
      server.writes.push({ method: 'POST', path, body: init?.body });
      return notFound();
    },
  }),
}));

const ULID = (n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69G5T${String(n).padStart(2, '0')}`;
const NOTE_ULID = (n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69G5N${String(n).padStart(2, '0')}`;

const task = (n: number, overrides: Partial<Task>): Task => ({
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
});

const daily = (n: number, date: string, taskIds: string[]): Note => ({
  id: NOTE_ULID(n),
  userId: 'u1',
  area: 'work',
  type: 'daily',
  date,
  title: '',
  bodyMarkdown: ['Standup', ...taskIds.map((id) => `{{task:${id}}}`)].join(
    '\n',
  ),
  tags: [],
  pinned: false,
  taskIds,
  version: 1,
  createdAt: `${date}T13:00:00.000Z`,
  updatedAt: `${date}T13:00:00.000Z`,
  deleted: false,
});

const addTask = (t: Task) => server.tasks.set(t.id, t);
const addNote = (n: Note) => server.notes.set(n.id, n);

function renderToday() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout />,
        children: [{ path: 'today', element: <NotebookTodayPage /> }],
      },
    ],
    { initialEntries: ['/today'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

const stillOpen = () => screen.getByTestId('still-open');
const comingUp = () => screen.getByTestId('coming-up');
const notePane = () =>
  screen
    .getByRole('textbox', { name: 'Note body' })
    .closest('.markdown-split')!;

/** Where a title shows on the page: the note, Still open or Coming up. */
const placesOf = (title: string) =>
  [
    within(notePane() as HTMLElement).queryAllByText(title).length
      ? 'note'
      : null,
    ...within(stillOpen())
      .queryAllByText(title)
      .map(() => 'still-open'),
    ...within(comingUp())
      .queryAllByText(title)
      .map(() => 'coming-up'),
  ].filter(Boolean);

const waitForPanels = async () => {
  await waitFor(() => {
    expect(within(stillOpen()).queryByText('Loading tasks…')).toBeNull();
    expect(within(comingUp()).queryByText('Loading tasks…')).toBeNull();
  });
};

describe('Today tasks', () => {
  beforeEach(() => {
    server.notes.clear();
    server.tasks.clear();
    server.writes = [];
    server.putGate = null;
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('the clock is in a zone where local midnight is not UTC midnight', () => {
    expect(new Date(2026, 9, 1, 23, 59).toISOString()).toBe(
      '2026-10-02T03:59:00.000Z',
    );
  });

  test('an unchecked task from yesterday’s note shows in Still open after local midnight, with no write', async () => {
    const carried = task(1, {
      title: 'Draft sidebar nav spec',
      noteId: NOTE_ULID(1),
    });
    addTask(carried);
    addNote(daily(1, '2026-10-01', [carried.id]));
    // Thursday 23:59:50 in New York: already Friday in UTC.
    vi.setSystemTime(new Date(2026, 9, 1, 23, 59, 50));
    renderToday();

    expect(
      await screen.findByRole('heading', { level: 1, name: /October 1/ }),
    ).toBeInTheDocument();
    await waitForPanels();
    await waitFor(() =>
      expect(placesOf('Draft sidebar nav spec')).toEqual(['note']),
    );

    vi.setSystemTime(new Date(2026, 9, 2, 0, 0, 5));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: /October 2/ }),
    ).toBeInTheDocument();
    const row = await within(stillOpen()).findByText('Draft sidebar nav spec');
    expect(row.closest('li')).toHaveTextContent('Thu note · 1 day');
    expect(
      within(row.closest('li')!).getByRole('link', {
        name: 'Thu note · 1 day',
      }),
    ).toHaveAttribute('href', `/notes/${NOTE_ULID(1)}`);
    expect(placesOf('Draft sidebar nav spec')).toEqual(['still-open']);
    expect(screen.getByTestId('carry-footer')).toHaveTextContent(
      '1 open task will carry to Saturday if not done',
    );
    expect(server.writes).toEqual([]);
  });

  test('an @mon task stays out of Still open until Monday, then shows Scheduled Oct 5', async () => {
    addTask(
      task(2, {
        title: 'Ask Sam for the brand fonts',
        startDate: '2026-10-05',
      }),
    );
    vi.setSystemTime(new Date(2026, 9, 4, 23, 59, 50));
    renderToday();
    await screen.findByRole('heading', { level: 1, name: /October 4/ });
    await waitForPanels();
    expect(placesOf('Ask Sam for the brand fonts')).toEqual(['coming-up']);
    expect(comingUp()).toHaveTextContent('Tomorrow · Mon, Oct 5');

    vi.setSystemTime(new Date(2026, 9, 5, 0, 0, 5));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByRole('heading', { level: 1, name: /October 5/ });
    const row = await within(stillOpen()).findByText(
      'Ask Sam for the brand fonts',
    );
    expect(row.closest('li')).toHaveTextContent('Scheduled Oct 5');
    expect(placesOf('Ask Sam for the brand fonts')).toEqual(['still-open']);
  });

  test('each task appears in exactly one place on the page', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
    const inNoteDueToday = task(3, {
      title: 'In note and due today',
      startDate: '2026-10-02',
      dueDate: '2026-10-02',
      noteId: NOTE_ULID(2),
    });
    const inNoteLater = task(4, {
      title: 'In note, shows Tuesday',
      startDate: '2026-10-06',
      noteId: NOTE_ULID(2),
    });
    const scheduledToday = task(5, {
      title: 'Scheduled today',
      startDate: '2026-10-02',
    });
    const fromYesterday = task(6, {
      title: 'From yesterday',
      noteId: NOTE_ULID(1),
    });
    const tomorrow = task(7, {
      title: 'Tomorrow one',
      startDate: '2026-10-03',
    });
    for (const t of [
      inNoteDueToday,
      inNoteLater,
      scheduledToday,
      fromYesterday,
      tomorrow,
    ]) {
      addTask(t);
    }
    addNote(daily(1, '2026-10-01', [fromYesterday.id]));
    addNote(daily(2, '2026-10-02', [inNoteDueToday.id, inNoteLater.id]));

    renderToday();
    await screen.findByRole('heading', { level: 1, name: /October 2/ });
    await waitForPanels();
    await waitFor(() =>
      expect(placesOf('In note and due today')).toEqual(['note']),
    );

    expect(placesOf('In note, shows Tuesday')).toEqual(['note']);
    expect(placesOf('Scheduled today')).toEqual(['still-open']);
    expect(placesOf('From yesterday')).toEqual(['still-open']);
    expect(placesOf('Tomorrow one')).toEqual(['coming-up']);
    const rowIds = [...document.querySelectorAll('[data-task-id]')].map((el) =>
      el.getAttribute('data-task-id'),
    );
    expect(new Set(rowIds).size).toBe(rowIds.length);
    expect(rowIds).not.toContain(inNoteDueToday.id);
    expect(rowIds).not.toContain(inNoteLater.id);
    // In the note and showing today, plus the two Still open rows.
    expect(screen.getByTestId('carry-footer')).toHaveTextContent(
      '3 open tasks will carry to Saturday if not done',
    );
  });

  test('Drop and Snooze remove the row before the server answers, and the server keeps the change', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
    addTask(task(8, { title: 'Reply to recruiter', startDate: '2026-09-30' }));
    addTask(task(9, { title: 'Renew card', startDate: '2026-09-28' }));
    let release!: () => void;
    server.putGate = new Promise((resolve) => {
      release = resolve;
    });
    const user = userEvent.setup();
    const view = renderToday();
    await screen.findByRole('heading', { level: 1, name: /October 2/ });
    await within(stillOpen()).findByText('Reply to recruiter');

    await user.click(
      screen.getByRole('button', { name: 'Drop Reply to recruiter' }),
    );
    expect(within(stillOpen()).queryByText('Reply to recruiter')).toBeNull();
    expect(server.tasks.get(ULID(8))?.status).toBe('todo');

    await user.click(
      screen.getByRole('button', {
        name: 'Snooze Renew card to Mon, Oct 5',
      }),
    );
    expect(within(stillOpen()).queryByText('Renew card')).toBeNull();
    expect(within(comingUp()).getByText('Renew card')).toBeInTheDocument();

    release();
    await waitFor(() => {
      expect(server.tasks.get(ULID(8))).toMatchObject({
        status: 'dropped',
        version: 2,
      });
      expect(server.tasks.get(ULID(9))).toMatchObject({
        startDate: '2026-10-05',
        version: 2,
      });
    });
    expect(server.writes.map((w) => w.body)).toEqual([
      { version: 1, status: 'dropped' },
      { version: 1, startDate: '2026-10-05', someday: false },
    ]);

    // A reload reads only the server.
    view.unmount();
    renderToday();
    await screen.findByRole('heading', { level: 1, name: /October 2/ });
    await waitForPanels();
    expect(within(stillOpen()).queryByText('Reply to recruiter')).toBeNull();
    expect(within(stillOpen()).queryByText('Renew card')).toBeNull();
    expect(within(comingUp()).getByText('Renew card')).toBeInTheDocument();
  });

  test('the Snooze menu sets another day; a failed write brings the row back', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
    addTask(task(10, { title: 'Plan Q4 posts', startDate: '2026-10-01' }));
    const user = userEvent.setup();
    renderToday();
    await within(await screen.findByTestId('still-open')).findByText(
      'Plan Q4 posts',
    );

    const trigger = screen.getByRole('combobox', {
      name: 'Snooze Plan Q4 posts to another day',
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      expect.stringMatching(/monday$/),
    );
    await user.keyboard('{Home}{Enter}');
    expect(within(stillOpen()).queryByText('Plan Q4 posts')).toBeNull();
    await waitFor(() =>
      expect(server.tasks.get(ULID(10))?.startDate).toBe('2026-10-03'),
    );
  });

  test('a Drop the server rejects puts the row back and says why', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
    addTask(task(11, { title: 'Stale one', startDate: '2026-10-01' }));
    let release!: () => void;
    server.putGate = new Promise((resolve) => {
      release = resolve;
    });
    const user = userEvent.setup();
    renderToday();
    await within(await screen.findByTestId('still-open')).findByText(
      'Stale one',
    );
    // Another device edits it after this page loaded.
    server.tasks.set(ULID(11), { ...server.tasks.get(ULID(11))!, version: 5 });

    await user.click(screen.getByRole('button', { name: 'Drop Stale one' }));
    expect(within(stillOpen()).queryByText('Stale one')).toBeNull();
    release();

    expect(
      await within(stillOpen()).findByText('Stale one'),
    ).toBeInTheDocument();
    expect(within(stillOpen()).getByRole('alert')).toHaveTextContent(
      'Could not drop “Stale one”: it changed on another device.',
    );
  });
});
