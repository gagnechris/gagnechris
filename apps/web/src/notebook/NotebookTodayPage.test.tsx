import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import { AUTOSAVE_RETRY_DELAYS_MS } from '@gagnechris/app-core';
import { NOTEBOOK_AREA_STORAGE_KEY } from '@gagnechris/shared';
import NotebookLayout from './NotebookLayout';
import NotebookTodayPage from './NotebookTodayPage';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';
import { TODAY_OVERLAY_QUERY } from './todaySidePreference';

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
  /** Daily notes the list route answers with, filtered by `from` and `to`. */
  listed: null as null | DailyNote[],
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
        if (path === '/api/notebook/notes' && state.listed) {
          const query = (
            init as { params?: { query?: Record<string, string> } }
          )?.params?.query;
          const from = query?.from ?? '';
          const to = query?.to ?? '9999-12-31';
          return {
            data: {
              items: state.listed.filter((n) => n.date >= from && n.date <= to),
            },
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

/** All timers fake, but still ticking, so Testing Library's polling works. */
const startAdvancingFakeTimers = () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
};

const BEFORE_FIRST_RETRY_MS = AUTOSAVE_RETRY_DELAYS_MS[0]! - 500;

/** In steps, so effects that schedule timers commit between them. */
const advance = async (ms: number) => {
  for (let left = ms; left > 0; left -= 100) {
    await act(() => vi.advanceTimersByTimeAsync(Math.min(100, left)));
  }
};

describe('NotebookTodayPage', () => {
  beforeEach(() => {
    state.note = null;
    state.others = {};
    state.offline = false;
    state.putDelayMs = 0;
    state.putGate = null;
    state.puts = 0;
    state.listed = null;
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

  test('the Tasks toggle on the title row hides the panel and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderToday();
    await screen.findByRole('textbox', { name: 'Note body' });
    const toggle = screen.getByRole('button', { name: /^Tasks/ });
    const side = screen.getByRole('complementary', { name: 'Today tasks' });
    expect(toggle.closest('.workspace-action-bar')).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', side.id);
    await user.click(toggle);
    expect(side.parentElement).toHaveClass('notebook-today--side-closed');
    const closed = screen.getByRole('button', { name: /^Tasks/ });
    expect(closed).toHaveAttribute('aria-expanded', 'false');
    expect(closed).toHaveTextContent(/^Tasks$/);
    expect(side.parentElement!.lastElementChild).toBe(side);

    unmount();
    renderToday();
    await screen.findByRole('textbox', { name: 'Note body' });
    expect(screen.getByRole('button', { name: /^Tasks/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('the Tasks toggle is on the title row with All selected', async () => {
    localStorage.setItem(NOTEBOOK_AREA_STORAGE_KEY, 'all');
    renderToday();
    await screen.findByText(/All shows both areas/);
    expect(
      (await screen.findByRole('button', { name: /^Tasks/ })).closest(
        '.workspace-action-bar',
      ),
    ).not.toBeNull();
  });

  test('⌥⌘\\ toggles the panel with focus in the editor', async () => {
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    editor.focus();
    const toggle = () => screen.getByRole('button', { name: /^Tasks/ });
    const press = (init: KeyboardEventInit) =>
      fireEvent.keyDown(editor, { code: 'Backslash', key: '«', ...init });

    press({ altKey: true, metaKey: true });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(editor).toHaveFocus();
    press({ altKey: true, ctrlKey: true });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    press({ metaKey: true });
    press({ altKey: true, metaKey: true, shiftKey: true });
    press({ altKey: true, metaKey: true, ctrlKey: true });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  test('dragging the panel edge past its minimum hides it', async () => {
    renderToday();
    await screen.findByRole('textbox', { name: 'Note body' });
    const handle = await screen.findByRole('separator', {
      name: 'Resize task panel',
    });
    // jsdom has no pointer capture.
    handle.setPointerCapture = () => {};
    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 1000, pointerId: 1 });
    const show = screen.getByRole('button', { name: /^Tasks/ });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(show).toHaveFocus();
  });

  test('the carry-over line ends the task panel, not the note', async () => {
    renderToday(null);
    const carry = await screen.findByTestId('carry-footer');
    const side = screen.getByRole('complementary', { name: 'Today tasks' });
    expect(side.lastElementChild).toBe(carry);
  });

  describe('between the tab bar and the side-by-side width', () => {
    let narrow = true;
    const listeners = new Set<() => void>();
    const setNarrow = (next: boolean) => {
      narrow = next;
      act(() => listeners.forEach((fn) => fn()));
    };

    beforeEach(() => {
      narrow = true;
      listeners.clear();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          disconnect() {}
        },
      );
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
          ({
            get matches() {
              return query === TODAY_OVERLAY_QUERY && narrow;
            },
            media: query,
            addEventListener: (_: string, fn: () => void) => listeners.add(fn),
            removeEventListener: (_: string, fn: () => void) =>
              listeners.delete(fn),
          }) as unknown as MediaQueryList,
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const openPage = async () => {
      renderToday();
      await screen.findByRole('textbox', { name: 'Note body' });
      return {
        toggle: () => screen.getByRole('button', { name: /^Tasks/ }),
        side: screen.getByRole('complementary', { name: 'Today tasks' }),
      };
    };
    const scrim = () => document.querySelector('.notebook-today__scrim');

    test('the panel starts closed and opens over the note without resizing', async () => {
      const user = userEvent.setup();
      const { toggle, side } = await openPage();
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(side.parentElement).toHaveClass(
        'notebook-today--overlay',
        'notebook-today--side-closed',
      );
      expect(scrim()).toBeNull();

      await user.click(toggle());
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      expect(side.parentElement).not.toHaveClass('notebook-today--side-closed');
      expect(scrim()).not.toBeNull();
      expect(side).toHaveFocus();
      expect(
        screen.queryByRole('separator', { name: 'Resize task panel' }),
      ).toBeNull();
    });

    test('Esc, the scrim and the toggle close it and focus the toggle', async () => {
      const user = userEvent.setup();
      const { toggle } = await openPage();

      const open = async () => {
        await user.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
        expect(toggle()).not.toHaveFocus();
      };

      await open();
      await user.keyboard('{Escape}');
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(toggle()).toHaveFocus();

      await open();
      await user.click(scrim()!);
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(toggle()).toHaveFocus();

      await open();
      await user.click(toggle());
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(toggle()).toHaveFocus();
    });

    test('⌥⌘\\ opens and closes it from the editor', async () => {
      const { toggle, side } = await openPage();
      const editor = screen.getByRole('textbox', { name: 'Note body' });
      editor.focus();
      const press = () =>
        fireEvent.keyDown(document.activeElement!, {
          code: 'Backslash',
          altKey: true,
          metaKey: true,
        });
      press();
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      expect(side).toHaveFocus();
      press();
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(toggle()).toHaveFocus();
    });

    test('overlay use leaves the remembered state, and a wider window restores it', async () => {
      const user = userEvent.setup();
      localStorage.setItem('gagnechris.notebook.todaySide', 'closed');
      localStorage.setItem('gagnechris.notebook.todaySideWidth', '300');
      const { toggle, side } = await openPage();
      await user.click(toggle());
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');

      setNarrow(false);
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(side.parentElement).not.toHaveClass('notebook-today--overlay');
      expect(scrim()).toBeNull();
      expect(localStorage.getItem('gagnechris.notebook.todaySide')).toBe(
        'closed',
      );
      expect(localStorage.getItem('gagnechris.notebook.todaySideWidth')).toBe(
        '300',
      );
      expect(
        side.parentElement!.style.getPropertyValue('--today-side-width'),
      ).toBe('300px');

      localStorage.setItem('gagnechris.notebook.todaySide', 'open');
      setNarrow(true);
      await user.click(toggle());
      await user.keyboard('{Escape}');
      setNarrow(false);
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
      expect(localStorage.getItem('gagnechris.notebook.todaySide')).toBe(
        'open',
      );
    });

    test('narrowing the window again starts the panel closed', async () => {
      const user = userEvent.setup();
      const { toggle } = await openPage();
      await user.click(toggle());
      setNarrow(false);
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      setNarrow(true);
      expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    });
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
    startAdvancingFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    state.offline = true;
    renderToday();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await user.type(editor, 'offline words');

    expect(await screen.findByText('Save failed (0).')).toBeInTheDocument();
    expect(state.note).toBeNull();

    state.offline = false;
    window.dispatchEvent(new Event('online'));

    // Short of the first backoff retry, with no further edit.
    await advance(BEFORE_FIRST_RETRY_MS);
    expect(state.note?.bodyMarkdown).toBe('offline words');
    expect(screen.queryByText('Save failed (0).')).not.toBeInTheDocument();
  });

  test('retries promptly when the browser comes back online while the failing save is in flight', async () => {
    startAdvancingFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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

    // Short of the first backoff retry, with no further edit.
    await advance(BEFORE_FIRST_RETRY_MS);
    expect(state.note?.bodyMarkdown).toBe('offline words');
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
    startAdvancingFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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

    // Short of the first backoff retry.
    await advance(BEFORE_FIRST_RETRY_MS);
    expect(state.note?.bodyMarkdown).toBe('offline words');
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

  test('the calendar browses months without changing the day', async () => {
    const user = userEvent.setup();
    const { router } = renderToday();
    await screen.findByRole('heading', { level: 1, name: /October 2/ });

    await user.click(screen.getByText('Calendar'));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeVisible();
    expect(router.state.location.search).toContain('date=2026-10-02');
    expect(
      screen.getByRole('heading', { level: 1, name: /October 2/ }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('gridcell', { name: /September 30, 2026/ }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: /September 30/ }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toContain('date=2026-09-30');
    expect(screen.queryByRole('grid')).not.toBeVisible();
  });

  test('the month buttons show each month with its own note markers, across a year end', async () => {
    const daily = (date: string): DailyNote => ({
      id: `01TESTDAILY${date.replace(/-/g, '')}0000000`,
      userId: 'u1',
      area: 'work',
      type: 'daily',
      date,
      title: '',
      bodyMarkdown: 'note',
      tags: [],
      pinned: false,
      version: 1,
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`,
      deleted: false,
    });
    state.listed = ['2026-11-03', '2026-12-04', '2027-01-04'].map(daily);
    const user = userEvent.setup();
    const { router } = renderToday('2026-12-10');
    await screen.findByRole('heading', { level: 1, name: /December 10/ });

    await user.click(screen.getByText('Calendar'));
    expect(
      await screen.findByRole('gridcell', {
        name: 'Friday, December 4, 2026, has a note',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'January 2027' })).toBeVisible();
    expect(
      await screen.findByRole('gridcell', {
        name: 'Monday, January 4, 2027, has a note',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('gridcell', { name: 'Tuesday, January 5, 2027' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeVisible();
    expect(
      await screen.findByRole('gridcell', {
        name: 'Tuesday, November 3, 2026, has a note',
      }),
    ).toBeVisible();

    expect(router.state.location.search).toContain('date=2026-12-10');
    expect(
      screen.getByRole('heading', { level: 1, name: /December 10/ }),
    ).toBeInTheDocument();
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
