import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookNotePage from './NotebookNotePage';
import NotebookTodayPage from './NotebookTodayPage';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';

type DailyNote = {
  id: string;
  userId: string;
  area: 'work' | 'personal';
  type: 'daily';
  date: string;
  title: string;
  bodyMarkdown: string;
  tags: string[];
  pinned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

const OLD_ID = '01TESTDAILYNOTEOLD00000001';

const state = vi.hoisted(() => ({
  note: null as null | DailyNote,
  puts: [] as Record<string, unknown>[],
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

const ok = (data: unknown) => ({
  data,
  error: undefined,
  response: { status: 200 },
});

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (
        path: string,
        init?: { params?: { path?: { id?: string; date?: string } } },
      ) => {
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          if (state.note && !state.note.deleted) return ok(state.note);
          return ok({
            exists: false,
            userId: 'u1',
            area: 'work',
            type: 'daily',
            date: init?.params?.path?.date ?? '2026-10-02',
            title: '',
            bodyMarkdown: '',
            tags: [],
            pinned: false,
            version: 0,
          });
        }
        if (path === '/api/notebook/notes/{id}') {
          if (state.note && state.note.id === init?.params?.path?.id) {
            return ok(state.note);
          }
          return {
            data: undefined,
            error: { error: 'not_found', message: 'Not found' },
            response: { status: 404 },
          };
        }
        if (path === '/api/notebook/notes' || path === '/api/notebook/tasks') {
          return ok({ items: [] });
        }
        return {
          data: undefined,
          error: { error: 'not_found' },
          response: { status: 404 },
        };
      },
      DELETE: async (_path: string, init?: { body?: { version?: number } }) => {
        const prev = state.note!;
        if (init?.body?.version !== prev.version) {
          return {
            data: undefined,
            error: { error: 'version_conflict', message: 'Conflict' },
            response: { status: 409 },
          };
        }
        state.note = { ...prev, deleted: true, version: prev.version + 1 };
        return ok(state.note);
      },
      PUT: async (_path: string, init?: { body?: Record<string, unknown> }) => {
        const body = init?.body ?? {};
        state.puts.push(body);
        const prev = state.note && !state.note.deleted ? state.note : null;
        if (prev && body.version !== prev.version) {
          return {
            data: undefined,
            error: { error: 'version_conflict', message: 'Conflict' },
            response: { status: 409 },
          };
        }
        if (!prev && body.version !== undefined) {
          return {
            data: undefined,
            error: { error: 'version_conflict', message: 'Conflict' },
            response: { status: 409 },
          };
        }
        const now = new Date().toISOString();
        state.note = {
          id: String(body.id),
          userId: 'u1',
          area: 'work',
          type: 'daily',
          date: '2026-10-02',
          title: String(body.title ?? ''),
          bodyMarkdown: String(body.bodyMarkdown ?? ''),
          tags: [],
          pinned: false,
          version: (prev?.version ?? 0) + 1,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
          deleted: false,
        };
        return ok(state.note);
      },
    }),
}));

const renderNotebook = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout user={testAuthUser} />,
        children: [
          { path: 'today', element: <NotebookTodayPage /> },
          { path: 'notes', element: <p>Notes list</p> },
          { path: 'notes/:id', element: <NotebookNotePage /> },
        ],
      },
    ],
    { initialEntries: ['/today?date=2026-10-02'] },
  );
  render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
  return router;
};

describe('Today after deleting its daily note', () => {
  beforeEach(() => {
    localStorage.clear();
    state.puts = [];
    state.note = {
      id: OLD_ID,
      userId: 'u1',
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: '',
      bodyMarkdown: 'old text',
      tags: [],
      pinned: false,
      version: 1,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      deleted: false,
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('shows an empty editor and the next save creates a new note', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const router = renderNotebook();
    expect(
      await screen.findByRole('textbox', { name: 'Note body' }),
    ).toHaveValue('old text');

    await act(async () => {
      await router.navigate(`/notes/${OLD_ID}`);
    });
    await screen.findByDisplayValue('old text');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Notes list')).toBeInTheDocument();
    expect(state.note?.deleted).toBe(true);

    await act(async () => {
      await router.navigate('/today?date=2026-10-02');
    });
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    expect(editor).toHaveValue('');
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument();

    await user.type(editor, 'fresh start');
    await waitFor(
      () => {
        expect(state.note?.bodyMarkdown).toBe('fresh start');
      },
      { timeout: 3000 },
    );
    expect(state.note?.id).not.toBe(OLD_ID);
    expect(state.note?.deleted).toBe(false);
    expect(state.puts[0]).toMatchObject({ bodyMarkdown: 'fresh start' });
    expect(state.puts[0]?.version).toBeUndefined();
    expect(screen.queryByText(/Conflict/)).not.toBeInTheDocument();
  });
});
