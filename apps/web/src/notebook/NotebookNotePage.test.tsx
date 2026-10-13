import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Note } from '@gagnechris/app-core';
import {
  answerConfirms,
  createTestQueryClient,
  QueryClientTestProvider,
} from '../test-utils';
import NotebookNotePage from './NotebookNotePage';

const NOTE_ID = '01JNOTEPAGEAAAAAAAAAAAAAA1';
const TS = '2026-10-02T12:00:00.000Z';

const api = vi.hoisted(() => ({
  note: null as Note | null,
  puts: [] as Record<string, unknown>[],
  deletes: [] as number[],
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

vi.mock('../kit/markdown/MarkdownPreview', () => ({
  default: ({ markdown }: { markdown: string }) => (
    <div data-testid="preview">{markdown}</div>
  ),
}));

type Init = {
  body?: Record<string, unknown>;
  params?: { path?: Record<string, string> };
};

const ok = (data: unknown) => ({
  data,
  error: undefined,
  response: { status: 200 },
});
const fail = (status: number, error: string, message = error) => ({
  data: undefined,
  error: { error, message },
  response: { status },
});

const write = (body: Record<string, unknown>, fields: Partial<Note>) => {
  const prev = api.note!;
  if (body.version !== prev.version) {
    return fail(409, 'version_conflict', 'Version conflict');
  }
  api.note = { ...prev, ...fields, version: prev.version + 1 };
  return ok(api.note);
};

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string, init?: Init) => {
      if (path === '/api/notebook/notes/{id}') {
        return api.note && api.note.id === init?.params?.path?.id
          ? ok(api.note)
          : fail(404, 'not_found', 'Note not found');
      }
      if (path === '/api/notebook/notes' || path === '/api/notebook/tasks') {
        return ok({ items: [] });
      }
      return fail(404, 'not_found');
    },
    POST: async (path: string) =>
      path.endsWith('/batch') ? ok({ items: [] }) : fail(404, 'not_found'),
    PUT: async (_path: string, init?: Init) => {
      const body = init?.body ?? {};
      api.puts.push(body);
      const { version: _version, ...fields } = body;
      return write(body, fields as Partial<Note>);
    },
    DELETE: async (_path: string, init?: Init) => {
      const body = init?.body ?? {};
      api.deletes.push(Number(body.version));
      return write(body, { deleted: true });
    },
  }),
}));

const seedNote = (fields: Partial<Note> = {}) => {
  api.note = {
    id: NOTE_ID,
    userId: 'u1',
    area: 'personal',
    type: 'page',
    date: null,
    title: 'Trip ideas',
    bodyMarkdown: 'Lisbon',
    tags: ['travel'],
    pinned: false,
    taskIds: [],
    version: 2,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
    ...fields,
  };
};

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/notes/:id', element: <NotebookNotePage /> },
      { path: '/notes', element: <h1>Note list</h1> },
      { path: '/today', element: <h1>Today page</h1> },
    ],
    { initialEntries: [`/notes/${NOTE_ID}`] },
  );
  render(
    <QueryClientTestProvider queryClient={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
  return router;
}

describe('NotebookNotePage', () => {
  beforeEach(() => {
    api.note = null;
    api.puts = [];
    api.deletes = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows a page and saves title, tags, pin and body with the version it read', async () => {
    seedNote();
    renderPage();
    const user = userEvent.setup();

    const title = await screen.findByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('Trip ideas');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Trip ideas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Personal page')).toBeInTheDocument();
    const tags = screen.getByRole('textbox', {
      name: 'Tags (comma-separated)',
    });
    expect(tags).toHaveValue('travel');
    expect(screen.getByRole('textbox', { name: 'Note body' })).toHaveValue(
      'Lisbon',
    );

    await user.type(tags, ', food');
    await user.click(screen.getByRole('checkbox', { name: 'Pinned' }));
    await user.type(screen.getByRole('textbox', { name: 'Note body' }), '!');

    await waitFor(
      () =>
        expect(api.note).toMatchObject({
          tags: ['travel', 'food'],
          pinned: true,
          bodyMarkdown: 'Lisbon!',
        }),
      { timeout: 4000 },
    );
    expect(api.puts[0]).toMatchObject({ version: 2 });
    expect(api.puts.map((p) => p.version)).toEqual(
      api.puts.map((_, i) => 2 + i),
    );
  });

  test('a save that loses to another device says so and keeps the text', async () => {
    seedNote();
    renderPage();
    const user = userEvent.setup();
    const title = await screen.findByRole('textbox', { name: 'Title' });
    api.note = { ...api.note!, title: 'Elsewhere', version: 3 };

    await user.type(title, ' 2027');
    expect(
      await screen.findByText(
        'Conflict — another device updated this note. Reload and try again.',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(title).toHaveValue('Trip ideas 2027');
    expect(api.note?.title).toBe('Elsewhere');
  });

  test('Delete asks first, sends the version and goes back to Notes', async () => {
    seedNote();
    const confirm = answerConfirms(true);
    const router = renderPage();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Note options' }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(confirm).toHaveBeenCalledWith(
      'Delete this page? It will disappear from your list.',
      'Delete',
    );
    expect(
      await screen.findByRole('heading', { name: 'Note list' }),
    ).toBeInTheDocument();
    expect(api.deletes).toEqual([2]);
    expect(router.state.location.pathname).toBe('/notes');
  });

  test('a daily note opens on Today for its date and area', async () => {
    seedNote({ type: 'daily', date: '2026-10-05', area: 'work' });
    const router = renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Today page' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/today');
    expect(router.state.location.search).toContain('date=2026-10-05');
    expect(api.puts).toEqual([]);
  });

  test('a note that is not there shows why, with a way back', async () => {
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Note not found',
    );
    expect(screen.getByRole('link', { name: '← Notes' })).toHaveAttribute(
      'href',
      '/notes',
    );
  });
});
