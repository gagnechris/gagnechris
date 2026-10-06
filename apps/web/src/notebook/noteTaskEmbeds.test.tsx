import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import type { Note, Task } from '@gagnechris/app-core';
import { createTestQueryClient, QueryClientTestProvider } from '../test-utils';
import NotebookTaskPage from './NotebookTaskPage';
import NotebookTodayPage from './NotebookTodayPage';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';

const TODAY = '2026-10-02';
const TS = '2026-10-02T12:00:00.000Z';

const api = vi.hoisted(() => ({
  notes: new Map<string, Note>(),
  daily: null as Note | null,
  tasks: new Map<string, Task>(),
  puts: [] as string[],
  taskPosts: [] as Record<string, unknown>[],
  /** Next task POST is written, then the response is lost. */
  dropNextTaskResponse: false,
}));

type Init = {
  body?: Record<string, unknown>;
  params?: { path?: Record<string, string> };
};

const ok = <T,>(data: T, status = 200) => ({
  data,
  error: undefined,
  response: { status },
});
const fail = (status: number, error: string) => ({
  data: undefined,
  error: { error, message: error },
  response: { status },
});

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (path: string, init?: Init) => {
        const p = init?.params?.path ?? {};
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          return ok(
            api.daily ?? {
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
        if (path === '/api/notebook/tasks/{id}') {
          const task = api.tasks.get(p.id!);
          return task && !task.deleted ? ok(task) : fail(404, 'not_found');
        }
        if (path === '/api/notebook/tasks') return ok({ items: [] });
        if (path === '/api/notebook/notes') return ok({ items: [] });
        return fail(404, 'not_found');
      },
      PUT: async (path: string, init?: Init) => {
        const body = init?.body ?? {};
        const p = init?.params?.path ?? {};
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          api.puts.push(String(body.bodyMarkdown));
          const prev = api.daily;
          api.daily = {
            id: String(body.id),
            userId: 'u1',
            area: 'work',
            type: 'daily',
            date: p.date!,
            title: '',
            bodyMarkdown: String(body.bodyMarkdown ?? prev?.bodyMarkdown ?? ''),
            tags: [],
            pinned: false,
            taskIds: [],
            version: (prev?.version ?? 0) + 1,
            createdAt: TS,
            updatedAt: TS,
            deleted: false,
          };
          api.notes.set(api.daily.id, api.daily);
          return ok(api.daily);
        }
        if (path === '/api/notebook/tasks/{id}') {
          const prev = api.tasks.get(p.id!)!;
          const next = {
            ...prev,
            title: String(body.title),
            version: prev.version + 1,
          };
          api.tasks.set(next.id, next);
          return ok(next);
        }
        return fail(404, 'not_found');
      },
      POST: async (path: string, init?: Init) => {
        const body = init?.body ?? {};
        const p = init?.params?.path ?? {};
        if (path === '/api/notebook/tasks') {
          api.taskPosts.push(body);
          // Mirrors the API: the linked note must already exist.
          if (!api.notes.has(String(body.noteId))) {
            return fail(400, 'bad_request');
          }
          const id = String(body.id);
          const existing = api.tasks.get(id);
          if (existing) return ok(existing);
          const task: Task = {
            id,
            userId: 'u1',
            area: body.area as Task['area'],
            title: String(body.title),
            description: '',
            priority: 'med',
            status: 'todo',
            dueDate: (body.dueDate as string | null | undefined) ?? null,
            startDate: null,
            someday: false,
            completedAt: null,
            noteId: String(body.noteId),
            tags: [],
            version: 1,
            createdAt: TS,
            updatedAt: TS,
            deleted: false,
          };
          api.tasks.set(id, task);
          if (api.dropNextTaskResponse) {
            api.dropNextTaskResponse = false;
            throw new TypeError('Failed to fetch');
          }
          return ok(task, 201);
        }
        const match =
          /^\/api\/notebook\/tasks\/\{id\}\/(complete|reopen)$/.exec(path);
        if (match) {
          const prev = api.tasks.get(p.id!)!;
          const done = match[1] === 'complete';
          const next: Task = {
            ...prev,
            status: done ? 'done' : 'todo',
            completedAt: done ? TS : null,
            version: prev.version + 1,
          };
          api.tasks.set(next.id, next);
          return ok(next);
        }
        return fail(404, 'not_found');
      },
    }),
}));

const TASK_ID = '01JTASKAAAAAAAAAAAAAAAAAAA';
const NOTE_A = '01JNOTEAAAAAAAAAAAAAAAAAAA';
const NOTE_B = '01JNOTEBBBBBBBBBBBBBBBBBBB';

function seedTask(overrides: Partial<Task> = {}) {
  api.tasks.set(TASK_ID, {
    id: TASK_ID,
    userId: 'u1',
    area: 'work',
    title: 'Call Sam',
    description: '',
    priority: 'high',
    status: 'todo',
    dueDate: null,
    startDate: '2026-10-06',
    someday: false,
    completedAt: null,
    noteId: NOTE_A,
    tags: [],
    version: 1,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
    ...overrides,
  });
}

async function editorView(container: HTMLElement): Promise<EditorView> {
  const content = await waitFor(() => {
    const el = container.querySelector('.cm-content');
    if (!el) throw new Error('editor not mounted');
    return el;
  });
  return EditorView.findFromDOM(content as HTMLElement)!;
}

function typeInto(view: EditorView, text: string) {
  act(() => {
    for (const ch of text) {
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: head, insert: ch },
        selection: EditorSelection.cursor(head + 1),
        userEvent: 'input.type',
      });
    }
  });
}

const KEY_CODES: Record<string, number> = {
  Enter: 13,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
};

function press(view: EditorView, key: keyof typeof KEY_CODES) {
  act(() => {
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        code: key,
        keyCode: KEY_CODES[key],
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

const pressEnter = (view: EditorView) => press(view, 'Enter');

const tokenLine = (id: string) => `{{task:${id}}}`;
const last = <T,>(items: T[]): T | undefined => items[items.length - 1];

beforeAll(() => {
  // jsdom has no layout; CodeMirror measures text ranges on every update.
  const empty = () => [] as unknown as DOMRectList;
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
});

beforeEach(() => {
  api.notes.clear();
  api.daily = null;
  api.tasks.clear();
  api.puts = [];
  api.taskPosts = [];
  api.dropNextTaskResponse = false;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('writing [ ] text in a daily note', () => {
  function renderToday() {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet context={{ areaFilter: 'work' }} />,
          children: [{ path: 'today', element: <NotebookTodayPage /> }],
        },
      ],
      { initialEntries: [`/today?date=${TODAY}`] },
    );
    return render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
  }

  test('creates exactly one task while autosave fires mid-typing and the first response is lost', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] Call');
    // Autosave lands mid-line: the half-typed line is just text.
    await waitFor(() => expect(api.puts).toContain('[ ] Call'), {
      timeout: 3000,
    });

    api.dropNextTaskResponse = true;
    typeInto(view, ' Sam');
    pressEnter(view);
    typeInto(view, 'Finance needs the PO');

    await waitFor(
      () =>
        expect(last(api.puts)).toMatch(
          /^\{\{task:[0-9A-Z]{26}\}\}\nFinance needs the PO$/,
        ),
      { timeout: 4000 },
    );
    // Pending rows are disabled until the create (and its retry) lands.
    await waitFor(
      () => {
        const boxes = within(container).getAllByRole('checkbox', {
          name: 'Complete Call Sam',
        });
        expect(boxes).toHaveLength(1);
        for (const box of boxes) expect(box).toBeEnabled();
      },
      { timeout: 5000 },
    );

    const id = /\{\{task:([0-9A-Z]{26})\}\}/.exec(last(api.puts)!)![1];
    expect([...api.tasks.keys()]).toEqual([id]);
    expect(api.tasks.get(id!)).toMatchObject({
      title: 'Call Sam',
      noteId: api.daily!.id,
      area: 'work',
    });
    // The retry after the lost response reused the id.
    expect(api.taskPosts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(api.taskPosts.map((b) => b.id))).toEqual(new Set([id]));
    // No save after the conversion brings the typed line back.
    const converted = api.puts.findIndex((b) => b.includes('{{task:'));
    expect(
      api.puts.slice(converted).some((b) => b.includes('[ ] Call Sam')),
    ).toBe(false);
    expect(view.state.doc.toString()).toBe(
      `${tokenLine(id!)}\nFinance needs the PO`,
    );
  }, 15_000);

  test('undo, edit, then leaving the line updates the one task instead of orphaning it', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] Call Sam');
    pressEnter(view);
    await waitFor(() => expect(api.tasks.size).toBe(1), { timeout: 5000 });
    const [id] = [...api.tasks.keys()];

    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe('[ ] Call Sam');
    typeInto(view, ' back');
    pressEnter(view);

    await waitFor(
      () => expect(api.tasks.get(id!)?.title).toBe('Call Sam back'),
      { timeout: 5000 },
    );
    expect([...api.tasks.keys()]).toEqual([id]);
    expect(new Set(api.taskPosts.map((b) => b.id))).toEqual(new Set([id]));
    expect(view.state.doc.toString()).toBe(`${tokenLine(id!)}\n`);
  }, 15_000);

  test('waits for the first save of a new day before linking the task', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] Call Sam');
    pressEnter(view);

    await waitFor(() => expect(api.tasks.size).toBe(1), { timeout: 5000 });
    expect(api.taskPosts[0]).toMatchObject({ title: 'Call Sam' });
    expect(api.notes.has(String(last(api.taskPosts)!.noteId))).toBe(true);
    await waitFor(() => expect(last(api.puts)).toMatch(/^\{\{task:/), {
      timeout: 3000,
    });
  }, 15_000);
});

describe('task syntax on a [ ] line in a note', () => {
  beforeEach(() => {
    // Friday 2026-10-02, local time.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderToday() {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet context={{ areaFilter: 'work' }} />,
          children: [{ path: 'today', element: <NotebookTodayPage /> }],
        },
      ],
      { initialEntries: [`/today?date=${TODAY}`] },
    );
    return render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
  }

  test('[ ] Call Sam @mon !high creates one task on next Monday with high priority', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] Call Sam @mon !high');
    pressEnter(view);

    await waitFor(() => expect(api.taskPosts.length).toBeGreaterThan(0), {
      timeout: 5000,
    });
    await waitFor(() => expect(api.tasks.size).toBe(1), { timeout: 5000 });
    const ids = new Set(api.taskPosts.map((b) => b.id));
    expect(ids.size).toBe(1);
    expect(last(api.taskPosts)).toMatchObject({
      title: 'Call Sam',
      startDate: '2026-10-05',
      someday: false,
      priority: 'high',
      noteId: api.daily!.id,
    });
    expect(view.state.doc.line(1).text).toBe(tokenLine([...ids][0] as string));
  });

  test('[ ] File taxes due:fri @mon sets the deadline apart from the show-on date', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] File taxes due:fri @mon');
    pressEnter(view);

    await waitFor(() => expect(api.tasks.size).toBe(1), { timeout: 5000 });
    expect(last(api.taskPosts)).toMatchObject({
      title: 'File taxes',
      startDate: '2026-10-05',
      dueDate: '2026-10-09',
    });
    // A week out on the same weekday reads as the date, not "Fri".
    expect(await screen.findAllByText('due Oct 9')).not.toHaveLength(0);
  });

  test('@ opens the date menu on the line; arrows, Enter and Esc drive it', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] Match fonts @');
    const listbox = await screen.findByRole('listbox', {
      name: 'Show this task on…',
    });
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.getAttribute('aria-label')),
    ).toEqual([
      'Tomorrow, Sat, Oct 3',
      'Monday, Oct 5',
      'Next week, Mon, Oct 5',
      'Someday, No date, parked',
      'Pick a date…',
      'Deadline…, due:',
    ]);
    const content = view.contentDOM;
    expect(content).toHaveAttribute('aria-controls', listbox.id);
    expect(content).toHaveAttribute('aria-haspopup', 'listbox');
    const active = () =>
      document.getElementById(content.getAttribute('aria-activedescendant')!);
    expect(active()).toHaveAttribute('aria-selected', 'true');
    expect(active()).toHaveTextContent('Tomorrow');
    expect(
      screen
        .getAllByRole('status')
        .some((el) => el.textContent?.startsWith('6 date options.')),
    ).toBe(true);
    expect(
      screen.getByText('Stays in this note. Shows up on Today from that date.'),
    ).toHaveAttribute('id', content.getAttribute('aria-describedby'));

    press(view, 'ArrowDown');
    expect(active()).toHaveTextContent('Monday');
    press(view, 'Escape');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(content).not.toHaveAttribute('aria-activedescendant');
    expect(view.state.doc.toString()).toBe('[ ] Match fonts @');

    typeInto(view, 'ne');
    expect(
      within(await screen.findByRole('listbox', { name: 'Show this task on…' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Next weekMon, Oct 5']);
    press(view, 'Enter');
    expect(view.state.doc.toString()).toBe('[ ] Match fonts @next week ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(api.taskPosts).toEqual([]);

    pressEnter(view);
    await waitFor(() => expect(api.taskPosts.length).toBeGreaterThan(0), {
      timeout: 5000,
    });
    expect(last(api.taskPosts)).toMatchObject({
      title: 'Match fonts',
      startDate: '2026-10-05',
    });
  });
});

describe('one task embedded in two notes', () => {
  function renderTwoNotes() {
    const queryClient = createTestQueryClient();
    const Notes = () => (
      <>
        <section aria-label="Note A">
          <NotebookMarkdownBody
            note={{ id: NOTE_A, area: 'work' }}
            value={`Standup\n${tokenLine(TASK_ID)}`}
            onChange={() => {}}
          />
        </section>
        <section aria-label="Note B">
          <NotebookMarkdownBody
            note={{ id: NOTE_B, area: 'work' }}
            value={`  ${tokenLine(TASK_ID)}\nfollow up`}
            onChange={() => {}}
          />
        </section>
        <Outlet />
      </>
    );
    const routes: RouteObject[] = [
      {
        path: '/',
        element: <Notes />,
        children: [{ path: 'tasks/:id', element: <NotebookTaskPage /> }],
      },
    ];
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <QueryClientTestProvider queryClient={queryClient}>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
    return { router };
  }

  const noteA = () => screen.getByRole('region', { name: 'Note A' });
  const noteB = () => screen.getByRole('region', { name: 'Note B' });

  test('completing it in one note checks it in every embed', async () => {
    seedTask();
    renderTwoNotes();
    const user = userEvent.setup();

    await waitFor(() =>
      expect(
        within(noteB()).getAllByRole('checkbox', { name: 'Complete Call Sam' }),
      ).toHaveLength(1),
    );
    expect(within(noteA()).getAllByText('High')).toHaveLength(1);

    const [inEditor] = within(noteA()).getAllByRole('checkbox', {
      name: 'Complete Call Sam',
    });
    await user.click(inEditor!);

    for (const note of [noteA(), noteB()]) {
      await waitFor(() => {
        const boxes = within(note).getAllByRole('checkbox', {
          name: 'Reopen Call Sam',
        });
        expect(boxes).toHaveLength(1);
        for (const box of boxes) expect(box).toBeChecked();
      });
    }
    expect(api.tasks.get(TASK_ID)?.status).toBe('done');
  });

  test('renaming the task changes the text in every embed', async () => {
    seedTask();
    const { router } = renderTwoNotes();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(within(noteB()).getAllByText('Call Sam')).toHaveLength(1),
    );

    await user.click(
      within(noteA()).getAllByRole('link', { name: 'Open task Call Sam' })[0]!,
    );
    expect(router.state.location.pathname).toBe(`/tasks/${TASK_ID}`);
    const title = await screen.findByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Call Sam back');

    for (const note of [noteA(), noteB()]) {
      await waitFor(
        () =>
          expect(within(note).getAllByText('Call Sam back')).toHaveLength(1),
        { timeout: 4000 },
      );
    }
    expect(api.tasks.get(TASK_ID)?.title).toBe('Call Sam back');
  });

  test('a deleted task renders as a muted row, not the token', async () => {
    renderTwoNotes();
    await waitFor(() =>
      expect(within(noteA()).getAllByText('Deleted task')).toHaveLength(1),
    );
    expect(document.body.textContent).not.toContain('{{task:');
  });
});
