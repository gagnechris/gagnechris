import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
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

const state = vi.hoisted(() => ({
  /** Other (area, date) daily notes, keyed `area:date`. */
  others: {} as Record<string, DailyNote>,
  /** When true, PUT fails like a dropped connection. */
  offline: false,
  /** Holds each PUT in flight this long before the server applies it. */
  putDelayMs: 0,
  /** Holds each PUT in flight until it resolves; `offline` is read at send time. */
  putGate: null as null | Promise<void>,
  puts: 0,
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

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (
        path: string,
        init?: { params?: { path?: { area?: string; date?: string } } },
      ) => {
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          const area = init?.params?.path?.area ?? 'work';
          const date = init?.params?.path?.date ?? '2026-10-02';
          if (area !== 'work' || date !== '2026-10-02') {
            const other = state.others[`${area}:${date}`];
            return {
              data: other ?? {
                exists: false,
                userId: 'u1',
                area,
                type: 'daily',
                date,
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
          params?: { path?: { area?: string; date?: string } };
        },
      ) => {
        state.puts += 1;
        const offlineAtSend = state.offline;
        if (state.putGate) await state.putGate;
        if (offlineAtSend) throw new TypeError('Failed to fetch');
        if (state.putDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, state.putDelayMs));
        }
        const body = init?.body ?? {};
        const area = (init?.params?.path?.area ?? 'work') as DailyNote['area'];
        const date = init?.params?.path?.date ?? '2026-10-02';
        if (area !== 'work' || date !== '2026-10-02') {
          const key = `${area}:${date}`;
          const prevOther = state.others[key];
          const now = new Date().toISOString();
          state.others[key] = {
            id: String(body.id),
            userId: 'u1',
            area,
            type: 'daily',
            date,
            title: String(body.title ?? ''),
            bodyMarkdown: String(body.bodyMarkdown ?? ''),
            tags: [],
            pinned: false,
            version: (prevOther?.version ?? 0) + 1,
            createdAt: prevOther?.createdAt ?? now,
            updatedAt: now,
            deleted: false,
          };
          return {
            data: state.others[key],
            error: undefined,
            response: { status: 200 },
          };
        }
        const prev = state.note;
        // Mirrors the API: a placeholder save (no version) after someone else
        // created the day gets 409 daily_taken with the winner.
        if (prev && body.version === undefined && body.id !== prev.id) {
          return {
            data: undefined,
            error: { error: 'daily_taken', message: 'Taken', current: prev },
            response: { status: 409 },
          };
        }
        if (
          prev &&
          body.version !== undefined &&
          body.version !== prev.version
        ) {
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

function renderToday(date: string | null = '2026-10-02') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout user={testAuthUser} />,
        children: [{ path: 'today', element: <NotebookTodayPage /> }],
      },
    ],
    {
      initialEntries: [date ? `/today?date=${date}` : '/today'],
    },
  );
  return {
    router,
    ...render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    ),
  };
}

const seedNote = (bodyMarkdown: string, version = 1) => {
  state.note = {
    id: '01TESTDAILYNOTE000000000001',
    userId: 'u1',
    area: 'work',
    type: 'daily',
    date: '2026-10-02',
    title: '',
    bodyMarkdown,
    tags: [],
    pinned: false,
    version,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    deleted: false,
  };
};

describe('NotebookTodayPage', () => {
  beforeEach(() => {
    state.note = null;
    state.others = {};
    state.offline = false;
    state.putDelayMs = 0;
    state.putGate = null;
    state.puts = 0;
    localStorage.clear();
    // Pin "today" away from the dates under test; only Date is faked.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('autosaves daily note body and keeps it after remount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderToday();

    expect(
      await screen.findByRole('heading', { level: 1, name: /October 2/ }),
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

    await user.keyboard('{Control>}s{/Control}');

    expect(
      await screen.findByText(
        /Conflict — another device updated this daily note/i,
      ),
    ).toBeInTheDocument();
    expect(editor).toHaveValue('base local');
  });

  test('saves typed text when the date changes before autosave', async () => {
    const user = userEvent.setup();
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'before next');

    // Well inside the 900 ms debounce.
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(state.note?.bodyMarkdown).toBe('before next');
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: /October 3/ }),
    ).toBeInTheDocument();
  });

  test('saves typed text when the area changes before autosave', async () => {
    const user = userEvent.setup();
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'work thoughts');

    await user.click(screen.getByRole('radio', { name: 'Personal' }));

    await waitFor(() => {
      expect(state.note?.bodyMarkdown).toBe('work thoughts');
    });
    expect(state.others['personal:2026-10-02']).toBeUndefined();
  });

  test('retries a failed save when the browser comes back online', async () => {
    const user = userEvent.setup();
    state.offline = true;
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'offline words');

    expect(await screen.findByText('Save failed (0).')).toBeInTheDocument();
    expect(state.note).toBeNull();

    state.offline = false;
    window.dispatchEvent(new Event('online'));

    // Well before the first 2 s backoff retry, with no further edit.
    await waitFor(
      () => {
        expect(state.note?.bodyMarkdown).toBe('offline words');
      },
      { timeout: 1500 },
    );
    expect(screen.queryByText('Save failed (0).')).not.toBeInTheDocument();
  });

  test('retries promptly when the browser comes back online while the failing save is in flight', async () => {
    const user = userEvent.setup();
    state.offline = true;
    let releasePut!: () => void;
    state.putGate = new Promise((resolve) => {
      releasePut = resolve;
    });
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'offline words');

    await waitFor(() => {
      expect(state.puts).toBe(1);
    });
    state.offline = false;
    state.putGate = null;
    window.dispatchEvent(new Event('online'));
    releasePut();

    // Well before the first 2 s backoff retry, with no further edit.
    await waitFor(
      () => {
        expect(state.note?.bodyMarkdown).toBe('offline words');
      },
      { timeout: 1500 },
    );
    expect(state.puts).toBe(2);
  });

  test('second tab on an empty daily note gets a recoverable conflict, not a stuck 400', async () => {
    const user = userEvent.setup();
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });

    // Tab A creates the day while this tab still holds the empty placeholder.
    state.note = {
      id: '01TESTDAILYNOTETABA00000001',
      userId: 'u1',
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: '',
      bodyMarkdown: 'from tab A',
      tags: [],
      pinned: false,
      version: 1,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      deleted: false,
    };

    await user.type(editor, 'from tab B');
    await user.keyboard('{Control>}s{/Control}');

    expect(
      await screen.findByText(/Another tab or device already started/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Save failed \(400\)/)).not.toBeInTheDocument();
    expect(editor).toHaveValue('from tab B');
    expect(state.note?.bodyMarkdown).toBe('from tab A');
  });
  test('offline edits survive a date change and save once back online', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    state.offline = true;
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'offline words');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /October 3/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(state.puts).toBeGreaterThan(0));
    expect(state.note).toBeNull();

    state.offline = false;
    window.dispatchEvent(new Event('online'));

    // Well before the first 2 s backoff retry.
    await waitFor(
      () => {
        expect(state.note?.bodyMarkdown).toBe('offline words');
      },
      { timeout: 1500 },
    );
    expect(confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(
      await screen.findByDisplayValue('offline words'),
    ).toBeInTheDocument();
  });

  test('a quick bounce during a slow save shows the saved text without a false conflict', async () => {
    const user = userEvent.setup();
    seedNote('first');
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    expect(editor).toHaveValue('first');
    state.putDelayMs = 400;

    await user.type(editor, ' second');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: /October 3/ });
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    const back = await screen.findByRole('textbox', { name: 'Note body' });
    expect(back).toHaveValue('first second');
    expect(state.note?.version).toBe(2);

    state.putDelayMs = 0;
    await user.type(back, ' third');
    await waitFor(
      () => {
        expect(state.note?.bodyMarkdown).toBe('first second third');
      },
      { timeout: 3000 },
    );
    expect(screen.queryByText(/Conflict/)).not.toBeInTheDocument();
    expect(back).toHaveValue('first second third');
  });

  test('Back steps through the days visited', async () => {
    const user = userEvent.setup();
    const { router } = renderToday();
    await screen.findByRole('heading', { level: 1, name: /October 2/ });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: /October 3/ });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { level: 1, name: /October 4/ });

    await act(async () => {
      await router.navigate(-1);
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: /October 3/ }),
    ).toBeInTheDocument();
  });

  test('midnight does not swap the day out from under someone typing', async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 50));
    renderToday(null);
    await screen.findByText('Work notebook · Today');
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'late night');

    vi.setSystemTime(new Date(2026, 9, 21, 0, 0, 5));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(
      screen.getByRole('heading', { level: 1, name: /October 20/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Note body' })).toBe(editor);
    expect(editor).toHaveValue('late night');
    await user.type(editor, ' still');
    await waitFor(
      () => {
        expect(state.others['work:2026-10-20']?.bodyMarkdown).toBe(
          'late night still',
        );
      },
      { timeout: 3000 },
    );
    expect(state.others['work:2026-10-21']).toBeUndefined();
  });

  test('an idle Today page rolls over to the new day', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 50));
    renderToday(null);
    await screen.findByRole('textbox', { name: 'Note body' });
    expect(
      screen.getByRole('heading', { level: 1, name: /October 20/ }),
    ).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 9, 21, 0, 0, 5));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: /October 21/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Work notebook · Today')).toBeInTheDocument();
  });
});
