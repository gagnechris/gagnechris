import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Note } from '@gagnechris/shared';
import { QueryClientTestProvider } from '../test-utils';
import { TaskMentions } from './TaskMentions';

const server = vi.hoisted(() => ({ notes: [] as Note[] }));

type Query = Record<string, string | number | undefined>;

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string, init?: { params?: { query?: Query } }) => {
      const q = init?.params?.query ?? {};
      if (path !== '/api/notebook/notes') {
        return { data: undefined, error: {}, response: { status: 404 } };
      }
      const start = Number(q.cursor ?? 0);
      const end = start + Number(q.limit ?? 50);
      return {
        data: {
          items: server.notes.slice(start, end),
          nextCursor: end < server.notes.length ? String(end) : undefined,
        },
        error: undefined,
        response: { status: 200 },
      };
    },
  }),
}));

const TASK = '01ARZ3NDEKTSV4RRFFQ695T001';
const OTHER = '01ARZ3NDEKTSV4RRFFQ695T002';

const note = (id: string, overrides: Partial<Note>): Note => ({
  id: `01ARZ3NDEKTSV4RRFFQ695N${id}`,
  userId: 'u1',
  area: 'work',
  type: 'daily',
  date: '2026-10-01',
  title: '',
  bodyMarkdown: '',
  tags: [],
  pinned: false,
  taskIds: [],
  version: 1,
  createdAt: '2026-10-01T13:00:00.000Z',
  updatedAt: '2026-10-01T13:00:00.000Z',
  deleted: false,
  ...overrides,
});

function renderMentions(homeNoteId: string | null = null) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <TaskMentions taskId={TASK} homeNoteId={homeNoteId} />,
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('TaskMentions', () => {
  beforeEach(() => {
    server.notes = [];
  });

  test('lists every note embedding the task, newest last, with its context', async () => {
    server.notes = [
      note('003', {
        date: '2026-10-03',
        bodyMarkdown: `{{task:${TASK}}}\nShipped it.`,
      }),
      note('001', {
        date: '2026-10-01',
        bodyMarkdown: `{{task:${TASK}}}\nStarted on the draft.`,
      }),
      note('002', {
        date: '2026-10-02',
        bodyMarkdown: `{{task:${OTHER}}}\nSomething else.\n{{task:${TASK}}}\n- blocked on review`,
      }),
      note('009', { date: '2026-10-04', bodyMarkdown: 'no embeds' }),
    ];
    renderMentions();

    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('link');
    expect(rows.map((a) => a.textContent)).toEqual([
      expect.stringContaining('Started on the draft.'),
      expect.stringContaining('blocked on review'),
      expect.stringContaining('Shipped it.'),
    ]);
    expect(rows[0]).toHaveAttribute(
      'href',
      '/notes/01ARZ3NDEKTSV4RRFFQ695N001',
    );
  });

  test('marks the task’s home note and puts it first', async () => {
    const home = '01ARZ3NDEKTSV4RRFFQ695N005';
    server.notes = [
      note('004', {
        date: '2026-10-01',
        bodyMarkdown: `{{task:${TASK}}}\nEarlier day.`,
      }),
      note('005', {
        date: '2026-10-09',
        bodyMarkdown: `{{task:${TASK}}}\nHome note.`,
      }),
    ];
    renderMentions(home);

    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('link');
    expect(rows[0]).toHaveTextContent('home');
    expect(rows[0]).toHaveTextContent('Home note.');
    expect(rows[1]).not.toHaveTextContent('home');
  });

  test('says so when no note embeds the task', async () => {
    server.notes = [note('006', { bodyMarkdown: `{{task:${OTHER}}}` })];
    renderMentions();
    expect(
      await screen.findByText('No note embeds this task yet.'),
    ).toBeInTheDocument();
  });
});
