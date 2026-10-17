import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { isOpenTaskStatus, localDayOf } from '@gagnechris/shared';
import type { Note, Task } from '@gagnechris/app-core';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookNotesPage from './NotebookNotesPage';

const server = vi.hoisted(() => ({
  notes: [] as Note[],
  tasks: [] as Task[],
  created: [] as Record<string, unknown>[],
  createFails: false,
}));

type Query = Record<string, string | number | undefined>;

/** Pages like the API, `limit` per page, cursor is the next offset. */
const page = <T,>(all: T[], q: Query) => {
  const start = Number(q.cursor ?? 0);
  const end = start + Number(q.limit ?? 50);
  return {
    items: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : undefined,
  };
};

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string, init?: { params?: { query?: Query } }) => {
      const q = init?.params?.query ?? {};
      const ok = (data: unknown) => ({
        data,
        error: undefined,
        response: { status: 200 },
      });
      if (path === '/api/notebook/notes') {
        return ok(
          page(
            server.notes.filter(
              (n) =>
                (!q.area || n.area === q.area) &&
                (!q.type || n.type === q.type),
            ),
            q,
          ),
        );
      }
      if (path === '/api/notebook/tasks') {
        return ok(
          page(
            server.tasks.filter(
              (t) =>
                (!q.area || t.area === q.area) &&
                (q.open !== 'true' || isOpenTaskStatus(t.status)),
            ),
            q,
          ),
        );
      }
      return { data: undefined, error: {}, response: { status: 404 } };
    },
    POST: async (_path: string, init?: { body?: Record<string, unknown> }) => {
      if (server.createFails) {
        return {
          data: undefined,
          error: { error: 'bad_request', message: 'Notebook is full' },
          response: { status: 400 },
        };
      }
      const body = init?.body ?? {};
      server.created.push(body);
      return {
        data: {
          userId: 'u1',
          date: null,
          taskIds: [],
          version: 1,
          createdAt: '2026-10-01T14:00:00.000Z',
          updatedAt: '2026-10-01T14:00:00.000Z',
          deleted: false,
          archived: false,
          ...body,
        },
        error: undefined,
        response: { status: 201 },
      };
    },
  }),
}));

const ULID = (prefix: string, n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69${prefix}${String(n).padStart(3, '0')}`;

const task = (
  n: number,
  status: Task['status'],
  area: Task['area'] = 'work',
): Task => ({
  id: ULID('5T', n),
  userId: 'u1',
  area,
  title: `Task ${n}`,
  description: '',
  priority: 'med',
  status,
  dueDate: null,
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: null,
  parentId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-01T14:00:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
  deleted: false,
});

const note = (n: number, overrides: Partial<Note>): Note => ({
  id: ULID('5N', n),
  userId: 'u1',
  area: 'work',
  type: 'page',
  date: null,
  title: `Note ${n}`,
  bodyMarkdown: '',
  tags: [],
  pinned: false,
  taskIds: [],
  version: 1,
  createdAt: '2026-09-01T13:00:00.000Z',
  updatedAt: '2026-09-01T13:00:00.000Z',
  deleted: false,
  ...overrides,
});

const embeds = (...tasks: Task[]) =>
  tasks.map((t) => `{{task:${t.id}}}`).join('\n');

function renderNotes() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout user={testAuthUser} />,
        children: [
          { path: 'notes', element: <NotebookNotesPage /> },
          { path: 'notes/:id', element: <h1>Note editor</h1> },
          { path: 'today', element: <h1>Today page</h1> },
        ],
      },
    ],
    { initialEntries: ['/notes'] },
  );
  render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
  return router;
}

const main = () => within(screen.getByRole('main'));

const sidebarNotes = () =>
  within(screen.getByRole('navigation', { name: 'Standing notes' }))
    .getAllByRole('link')
    .map((a) => a.textContent);

const rowTexts = (section: string) =>
  within(screen.getByRole('region', { name: section }))
    .getAllByRole('link')
    .map((a) => a.textContent);

describe('NotebookNotesPage', () => {
  beforeEach(() => {
    server.notes = [];
    server.tasks = [];
    server.created = [];
    server.createFails = false;
    localStorage.clear();
  });

  test('counts each note’s unchecked embedded tasks, across every page of tasks', async () => {
    const open = Array.from({ length: 120 }, (_, i) => task(i, 'todo'));
    const done = task(200, 'done');
    const dropped = task(201, 'dropped');
    const personal = task(202, 'in_progress', 'personal');
    server.tasks = [...open, done, dropped, personal];
    server.notes = [
      note(1, {
        title: 'Busy page',
        bodyMarkdown: `Plan\n${embeds(open[0]!, open[119]!, done, dropped, personal)}`,
      }),
      note(2, { title: 'Quiet page', bodyMarkdown: embeds(done) }),
    ];
    renderNotes();
    const busy = await main().findByRole('link', { name: /Busy page/ });
    await waitFor(() =>
      expect(busy).toHaveTextContent('Busy pagePlan · Sep 1 · 3 open'),
    );
    expect(main().getByRole('link', { name: /Quiet page/ })).toHaveTextContent(
      'Quiet pageSep 1',
    );
  });

  test('pinned notes stay on top in every type filter', async () => {
    const user = userEvent.setup();
    server.notes = [
      note(1, { title: 'Pinned page', pinned: true }),
      note(2, {
        type: 'daily',
        date: '2026-09-02',
        title: '',
        pinned: true,
      }),
      note(3, { title: 'Recent page', updatedAt: new Date().toISOString() }),
      note(4, { type: 'daily', date: '2026-08-30', title: '' }),
    ];
    renderNotes();
    await screen.findByRole('region', { name: 'Pinned' });
    expect(rowTexts('Pinned')).toEqual([
      expect.stringMatching(/^Wednesday, Sep 2/),
      expect.stringMatching(/^Pinned page/),
    ]);
    expect(rowTexts('This week')).toEqual([
      expect.stringMatching(/^Recent page/),
    ]);

    const types = screen.getByRole('radiogroup', { name: 'Note type' });
    await user.click(within(types).getByRole('radio', { name: 'Daily' }));
    await waitFor(() =>
      expect(rowTexts('Pinned')).toEqual([
        expect.stringMatching(/^Wednesday, Sep 2/),
      ]),
    );
    expect(rowTexts('Earlier')).toEqual([
      expect.stringMatching(/^Sunday, Aug 30/),
    ]);

    await user.keyboard('{ArrowRight}');
    expect(
      within(types).getByRole('radio', { name: 'Standing' }),
    ).toHaveFocus();
    await waitFor(() =>
      expect(rowTexts('Pinned')).toEqual([
        expect.stringMatching(/^Pinned page/),
      ]),
    );
  });

  test('a daily note opens on Today and a page in the page editor', async () => {
    server.notes = [
      note(1, { title: 'A page' }),
      note(2, {
        type: 'daily',
        date: '2026-09-02',
        title: '',
      }),
    ];
    renderNotes();
    expect(await main().findByRole('link', { name: /A page/ })).toHaveAttribute(
      'href',
      `/notes/${ULID('5N', 1)}`,
    );
    expect(
      main().getByRole('link', { name: /Wednesday, Sep 2/ }),
    ).toHaveAttribute('href', '/today?date=2026-09-02&area=work');
  });

  test('New offers a note for a day, defaulting to today, or a standing note', async () => {
    const user = userEvent.setup();
    const router = renderNotes();
    const newButton = await screen.findByRole('button', { name: 'New' });

    await user.click(newButton);
    const menu = screen.getByRole('group', { name: 'New note' });
    const day = within(menu).getByLabelText('Note for a day');
    expect(day).toHaveValue(localDayOf(new Date().toISOString()));
    await user.clear(day);
    await user.type(day, '2026-09-30');
    await user.click(within(menu).getByRole('button', { name: 'Open day' }));
    expect(
      await screen.findByRole('heading', { name: 'Today page' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/today');
    expect(router.state.location.search).toBe('?date=2026-09-30&area=work');

    await router.navigate('/notes');
    await user.click(await screen.findByRole('button', { name: 'New' }));
    await user.click(screen.getByRole('button', { name: 'Standing note' }));
    expect(
      await screen.findByRole('heading', { name: 'Note editor' }),
    ).toBeInTheDocument();
    expect(server.created).toEqual([
      expect.objectContaining({ type: 'page', area: 'work' }),
    ]);
    expect(router.state.location.pathname).toBe(
      `/notes/${String(server.created[0]!.id)}`,
    );
  });

  test('New closes on Escape with focus back on it, on a click outside, and when focus leaves', async () => {
    const user = userEvent.setup();
    renderNotes();
    const newButton = await screen.findByRole('button', { name: 'New' });
    const menu = () => screen.queryByRole('group', { name: 'New note' });

    await user.click(newButton);
    await user.click(within(menu()!).getByLabelText('Note for a day'));
    await user.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(newButton).toHaveFocus();

    await user.click(newButton);
    await user.click(screen.getByRole('heading', { level: 1 }));
    expect(menu()).toBeNull();

    await user.click(newButton);
    within(menu()!).getByRole('button', { name: 'Standing note' }).focus();
    await user.tab();
    expect(menu()).toBeNull();
  });

  test('archived notes leave the default list and the Standing filter; Archived shows them', async () => {
    const user = userEvent.setup();
    server.notes = [
      note(1, { title: 'Live page' }),
      note(2, { title: 'Old project', archived: true }),
      note(3, { type: 'daily', date: '2026-08-30', title: '' }),
    ];
    renderNotes();
    await main().findByRole('link', { name: /Live page/ });
    expect(main().queryByRole('link', { name: /Old project/ })).toBeNull();

    const types = screen.getByRole('radiogroup', { name: 'Note type' });
    await user.click(within(types).getByRole('radio', { name: 'Standing' }));
    await waitFor(() =>
      expect(main().queryByRole('link', { name: /Sunday, Aug 30/ })).toBeNull(),
    );
    expect(main().getByRole('link', { name: /Live page/ })).toBeInTheDocument();
    expect(main().queryByRole('link', { name: /Old project/ })).toBeNull();

    await user.click(within(types).getByRole('radio', { name: 'Archived' }));
    expect(
      await main().findByRole('link', { name: /Old project/ }),
    ).toBeInTheDocument();
    expect(main().queryByRole('link', { name: /Live page/ })).toBeNull();
  });

  test('the sidebar lists standing notes not archived, pinned first, then most recently updated', async () => {
    server.notes = [
      note(1, { title: 'Older', updatedAt: '2026-09-01T13:00:00.000Z' }),
      note(2, { title: 'Newer', updatedAt: '2026-09-20T13:00:00.000Z' }),
      note(3, {
        title: 'Pinned',
        pinned: true,
        updatedAt: '2026-08-01T13:00:00.000Z',
      }),
      note(4, { title: 'Shelved', archived: true }),
      note(5, { type: 'daily', date: '2026-09-21', title: '' }),
    ];
    renderNotes();
    await waitFor(() =>
      expect(sidebarNotes()).toEqual(['Pinned', 'Newer', 'Older']),
    );
    const sidebar = screen.getByRole('navigation', { name: 'Standing notes' });
    expect(
      within(sidebar).getByRole('link', { name: 'Newer' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`^/notes/${ULID('5N', 2)}\\?area=`)),
    );
  });

  test('a failed New standing note says why', async () => {
    const user = userEvent.setup();
    server.createFails = true;
    renderNotes();
    await user.click(await screen.findByRole('button', { name: 'New' }));
    await user.click(screen.getByRole('button', { name: 'Standing note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Notebook is full',
    );
    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByRole('button', { name: 'Standing note' })).toBeEnabled();
  });
});
