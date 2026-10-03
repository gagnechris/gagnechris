import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider } from '../../test-utils';
import AdminNotebookLayout from '../AdminNotebookLayout';
import AdminNotebookTodayPage from './AdminNotebookTodayPage';

const state = vi.hoisted(() => ({
  note: null as null | {
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
  },
}));

vi.mock('../../components/markdown/MarkdownEditor', () => ({
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

vi.mock('../../components/markdown/MarkdownPreview', () => ({
  default: ({ markdown }: { markdown: string }) => (
    <div data-testid="preview">{markdown}</div>
  ),
}));

vi.mock('../../api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) => {
      if (path === '/api/notebook/notes/daily/{area}/{date}') {
        if (!state.note) {
          return {
            data: {
              exists: false,
              userId: 'u1',
              area: 'work',
              type: 'daily',
              date: '2026-10-02',
              title: '',
              bodyMarkdown: '',
              tags: [],
              pinned: false,
              version: 0,
            },
            error: undefined,
            response: { status: 200 },
          };
        }
        return {
          data: state.note,
          error: undefined,
          response: { status: 200 },
        };
      }
      if (path === '/api/notebook/notes') {
        return {
          data: { items: state.note ? [state.note] : [] },
          error: undefined,
          response: { status: 200 },
        };
      }
      if (path === '/api/notebook/tasks') {
        return {
          data: { items: [] },
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
    PUT: async (
      _path: string,
      init?: {
        body?: Record<string, unknown>;
        params?: { path?: { date?: string } };
      },
    ) => {
      const body = init?.body ?? {};
      const prev = state.note;
      if (prev && body.version !== undefined && body.version !== prev.version) {
        return {
          data: undefined,
          error: { error: 'version_conflict', message: 'Conflict' },
          response: { status: 409 },
        };
      }
      const now = new Date().toISOString();
      state.note = {
        id: String(body.id ?? prev?.id ?? '01TESTDAILYNOTE000000000001'),
        userId: 'u1',
        area: 'work',
        type: 'daily',
        date: init?.params?.path?.date ?? '2026-10-02',
        title: String(body.title ?? prev?.title ?? ''),
        bodyMarkdown: String(body.bodyMarkdown ?? prev?.bodyMarkdown ?? ''),
        tags: Array.isArray(body.tags)
          ? (body.tags as string[])
          : (prev?.tags ?? []),
        pinned: Boolean(body.pinned ?? prev?.pinned ?? false),
        version: (prev?.version ?? 0) + 1,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        deleted: false,
      };
      return {
        data: state.note,
        error: undefined,
        response: { status: 200 },
      };
    },
  }),
}));

function renderToday(date = '2026-10-02') {
  const router = createMemoryRouter(
    [
      {
        path: '/admin/notebook',
        element: <AdminNotebookLayout />,
        children: [{ path: 'today', element: <AdminNotebookTodayPage /> }],
      },
    ],
    { initialEntries: [`/admin/notebook/today?date=${date}`] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('AdminNotebookTodayPage', () => {
  beforeEach(() => {
    state.note = null;
    localStorage.clear();
  });

  test('autosaves daily note body and keeps it after remount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderToday();

    expect(
      await screen.findByRole('heading', { name: 'Today' }),
    ).toBeInTheDocument();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.clear(editor);
    await user.type(editor, 'hello daily');

    await waitFor(
      () => {
        expect(state.note?.bodyMarkdown).toContain('hello daily');
        expect(state.note?.version).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    unmount();
    renderToday();

    expect(await screen.findByDisplayValue(/hello daily/)).toBeInTheDocument();
  });

  test('surfaces version conflict instead of silent overwrite', async () => {
    const user = userEvent.setup();
    state.note = {
      id: '01TESTDAILYNOTE000000000001',
      userId: 'u1',
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: '',
      bodyMarkdown: 'base',
      tags: [],
      pinned: false,
      version: 1,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      deleted: false,
    };

    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, ' local');

    state.note = { ...state.note, version: 9, bodyMarkdown: 'remote' };

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        /Conflict — another device updated this daily note/i,
      ),
    ).toBeInTheDocument();
    expect(editor).toHaveValue('base local');
  });
});
