import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { isOpenTaskStatus, type Note, type Task } from '@gagnechris/shared';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookNotesPage from './NotebookNotesPage';

const server = vi.hoisted(() => ({
  notes: [] as Note[],
  tasks: [] as Task[],
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
        children: [{ path: 'notes', element: <NotebookNotesPage /> }],
      },
    ],
    { initialEntries: ['/notes'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

const rowTexts = (section: string) =>
  within(screen.getByRole('region', { name: section }))
    .getAllByRole('link')
    .map((a) => a.textContent);

describe('NotebookNotesPage', () => {
  beforeEach(() => {
    server.notes = [];
    server.tasks = [];
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
    const busy = await screen.findByRole('link', { name: /Busy page/ });
    await waitFor(() =>
      expect(busy).toHaveTextContent('Busy pagePlan · Sep 1 · 3 open'),
    );
    expect(screen.getByRole('link', { name: /Quiet page/ })).toHaveTextContent(
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
    expect(within(types).getByRole('radio', { name: 'Pages' })).toHaveFocus();
    await waitFor(() =>
      expect(rowTexts('Pinned')).toEqual([
        expect.stringMatching(/^Pinned page/),
      ]),
    );
  });
});
