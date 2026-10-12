import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo, undoDepth } from '@codemirror/commands';
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
import {
  createTestQueryClient,
  PAST_AUTOSAVE_MS,
  QueryClientTestProvider,
} from '../test-utils';
import {
  EMBED_DELETE_GRACE_MS,
  EMBED_RETRY_DELAYS_MS,
} from '@gagnechris/app-core';
import { useState } from 'react';
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
  taskPuts: [] as Record<string, unknown>[],
  taskDeletes: [] as string[],
  /** Every task read: `GET <id>` or `BATCH <ids>`. */
  taskReads: [] as string[],
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
          api.taskReads.push(`GET ${p.id}`);
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
          api.taskPuts.push(body);
          const prev = api.tasks.get(p.id!)!;
          if (body.version !== prev.version) return fail(409, 'conflict');
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
        if (path === '/api/notebook/tasks/batch') {
          const ids = body.ids as string[];
          api.taskReads.push(`BATCH ${ids.join(',')}`);
          return ok({
            items: ids.flatMap((id) => {
              const task = api.tasks.get(id);
              return task && !task.deleted ? [task] : [];
            }),
          });
        }
        if (path === '/api/notebook/tasks') {
          api.taskPosts.push(body);
          // Mirrors the API: the linked note must already exist.
          if (!api.notes.has(String(body.noteId))) {
            return {
              ...fail(400, 'bad_request'),
              error: {
                error: 'bad_request',
                message: 'noteId must reference an existing note',
                fields: { noteId: 'not_found' },
              },
            };
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
      DELETE: async (path: string, init?: Init) => {
        const body = init?.body ?? {};
        const p = init?.params?.path ?? {};
        if (path === '/api/notebook/tasks/{id}') {
          api.taskDeletes.push(p.id!);
          const prev = api.tasks.get(p.id!);
          if (!prev || prev.deleted) return fail(404, 'not_found');
          if (body.version !== prev.version) return fail(409, 'conflict');
          const next = { ...prev, deleted: true, version: prev.version + 1 };
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
  Backspace: 8,
  Delete: 46,
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
  api.taskPuts = [];
  api.taskDeletes = [];
  api.taskReads = [];
  api.dropNextTaskResponse = false;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '[ ] Call');
    // Autosave lands mid-line: the half-typed line is just text.
    await act(() => vi.advanceTimersByTimeAsync(PAST_AUTOSAVE_MS));
    await waitFor(() => expect(api.puts).toContain('[ ] Call'));

    api.dropNextTaskResponse = true;
    typeInto(view, ' Sam');
    pressEnter(view);
    typeInto(view, 'Finance needs the PO');

    // The retry after the lost response, then the autosave that follows it.
    await act(() => vi.advanceTimersByTimeAsync(EMBED_RETRY_DELAYS_MS[0]!));
    await act(() => vi.advanceTimersByTimeAsync(PAST_AUTOSAVE_MS));
    await waitFor(() =>
      expect(last(api.puts)).toMatch(
        /^\{\{task:[0-9A-Z]{26}\}\}\nFinance needs the PO$/,
      ),
    );
    // Pending rows are disabled until the create (and its retry) lands.
    await waitFor(() => {
      const boxes = within(container).getAllByRole('checkbox', {
        name: 'Complete Call Sam',
      });
      expect(boxes).toHaveLength(1);
      for (const box of boxes) expect(box).toBeEnabled();
    });

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
  });

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
    expect(api.taskDeletes).toEqual([]);
  }, 15_000);

  test('opening a note that embeds three tasks reads them in one request', async () => {
    const ids = [
      '01JTASKAAAAAAAAAAAAAAAAAA1',
      '01JTASKAAAAAAAAAAAAAAAAAA2',
      '01JTASKAAAAAAAAAAAAAAAAAA3',
    ];
    ids.forEach((id, i) => {
      seedTask({ id, title: `Embedded ${i + 1}`, noteId: null });
      api.tasks.set(id, api.tasks.get(TASK_ID)!);
    });
    api.tasks.delete(TASK_ID);
    const gone = '01JTASKAAAAAAAAAAAAAAAAAA4';
    api.daily = {
      id: NOTE_A,
      userId: 'u1',
      area: 'work',
      type: 'daily',
      date: TODAY,
      title: '',
      bodyMarkdown: [...ids, gone].map(tokenLine).join('\n'),
      tags: [],
      pinned: false,
      taskIds: [...ids, gone],
      version: 1,
      createdAt: TS,
      updatedAt: TS,
      deleted: false,
    };
    const { container } = renderToday();
    // The deleted task's line leaves the note, and the note saves without it.
    await waitFor(
      () => expect(last(api.puts)).toBe(ids.map(tokenLine).join('\n')),
      { timeout: 4000 },
    );
    for (const n of [1, 2, 3]) {
      expect(
        await within(container).findByRole('checkbox', {
          name: `Complete Embedded ${n}`,
        }),
      ).toBeInTheDocument();
    }
    expect(within(container).queryByText('Deleted task')).toBeNull();
    expect(api.taskReads[0]).toBe(`BATCH ${[...ids, gone].sort().join(',')}`);
  });

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
      expect(within(noteB()).getAllByDisplayValue('Call Sam')).toHaveLength(1),
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
          expect(
            within(note).getAllByDisplayValue('Call Sam back'),
          ).toHaveLength(1),
        { timeout: 4000 },
      );
    }
    expect(api.tasks.get(TASK_ID)?.title).toBe('Call Sam back');
  });
});

describe('deleting an embedded task', () => {
  let body = '';
  function renderNote(initial: string) {
    body = initial;
    const Note = () => {
      const [value, setValue] = useState(initial);
      return (
        <NotebookMarkdownBody
          note={{ id: NOTE_A, area: 'work' }}
          value={value}
          onChange={(next) => {
            body = next;
            setValue(next);
          }}
        />
      );
    };
    const router = createMemoryRouter([{ path: '/', element: <Note /> }]);
    return render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
  }

  function deleteEmbedLine(view: EditorView, userEvent = 'delete') {
    const at = view.state.doc.toString().indexOf(tokenLine(TASK_ID));
    const line = view.state.doc.lineAt(at);
    act(() => {
      view.dispatch({
        changes: { from: line.from - 1, to: line.to },
        userEvent,
      });
    });
  }

  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  // A delete would start by now; its request settles on timers too.
  const deletedAfterGrace = async () => {
    await tick(EMBED_DELETE_GRACE_MS + 10);
    for (let i = 0; i < 10; i += 1) await tick(20);
  };

  test('deleting its line deletes the task once the line stays gone', async () => {
    seedTask();
    const { container } = renderNote(`Standup\n${tokenLine(TASK_ID)}`);
    await within(container).findByRole('textbox', { name: 'Task title' });
    const view = await editorView(container);

    deleteEmbedLine(view);
    expect(body).toBe('Standup');
    await new Promise((resolve) =>
      setTimeout(resolve, EMBED_DELETE_GRACE_MS / 2),
    );
    expect(api.taskDeletes).toEqual([]);

    await waitFor(() => expect(api.taskDeletes).toEqual([TASK_ID]), {
      timeout: EMBED_DELETE_GRACE_MS * 2,
    });
    expect(api.tasks.get(TASK_ID)?.deleted).toBe(true);
  }, 15_000);

  test('undo brings the line back and keeps the task', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedTask();
    const { container } = renderNote(`Standup\n${tokenLine(TASK_ID)}`);
    await within(container).findByRole('textbox', { name: 'Task title' });
    const view = await editorView(container);

    deleteEmbedLine(view);
    act(() => {
      undo(view);
    });
    expect(body).toBe(`Standup\n${tokenLine(TASK_ID)}`);

    await deletedAfterGrace();
    expect(api.taskDeletes).toEqual([]);
  });

  test('cutting the line keeps the task, since it is being moved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedTask();
    const { container } = renderNote(`Standup\n${tokenLine(TASK_ID)}`);
    await within(container).findByRole('textbox', { name: 'Task title' });
    const view = await editorView(container);

    deleteEmbedLine(view, 'delete.cut');

    await deletedAfterGrace();
    expect(api.taskDeletes).toEqual([]);
  });

  test('closing the note right after deleting the line deletes the task at once', async () => {
    seedTask();
    const { container, unmount } = renderNote(`Standup\n${tokenLine(TASK_ID)}`);
    await within(container).findByRole('textbox', { name: 'Task title' });
    deleteEmbedLine(await editorView(container));

    unmount();
    await waitFor(() => expect(api.taskDeletes).toEqual([TASK_ID]));
  });

  test('Backspace in an emptied title deletes the line and the task', async () => {
    seedTask();
    const { container, unmount } = renderNote(
      `Standup\n${tokenLine(TASK_ID)}\nnotes`,
    );
    const user = userEvent.setup();
    const field = await within(container).findByRole('textbox', {
      name: 'Task title',
    });

    await user.clear(field);
    expect(body).toContain(tokenLine(TASK_ID));
    await user.keyboard('{Backspace}');
    expect(body).toBe('Standup\nnotes');
    expect(api.taskPuts).toEqual([]);

    unmount();
    await waitFor(() => expect(api.taskDeletes).toEqual([TASK_ID]));
  });

  test('the line of a task deleted elsewhere leaves the note', async () => {
    seedTask({ deleted: true });
    const { container } = renderNote(`Standup\n${tokenLine(TASK_ID)}\nnotes`);

    await waitFor(() => expect(body).toBe('Standup\nnotes'));
    expect(within(container).queryByText('Deleted task')).toBeNull();
    expect(api.taskDeletes).toEqual([]);
  });
});

describe('editing an embedded task title in place', () => {
  function renderNotes(body: string, onChange = vi.fn()) {
    const Notes = () => (
      <>
        <section aria-label="Note A">
          <NotebookMarkdownBody
            note={{ id: NOTE_A, area: 'work' }}
            value={body}
            onChange={onChange}
          />
        </section>
        <section aria-label="Note B">
          <NotebookMarkdownBody
            note={{ id: NOTE_B, area: 'work' }}
            value={tokenLine(TASK_ID)}
            onChange={() => {}}
          />
        </section>
      </>
    );
    const router = createMemoryRouter([{ path: '/', element: <Notes /> }]);
    const utils = render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
    return { ...utils, onChange };
  }

  const noteA = () => screen.getByRole('region', { name: 'Note A' });
  const noteB = () => screen.getByRole('region', { name: 'Note B' });
  const titleIn = (note: HTMLElement) =>
    within(note).findByRole<HTMLTextAreaElement>('textbox', {
      name: 'Task title',
    });

  test('typing, pasting and undo keys in the field save the task and leave the note alone', async () => {
    seedTask();
    const body = `Standup\n${tokenLine(TASK_ID)}\nnotes`;
    const { onChange } = renderNotes(body);
    const user = userEvent.setup();
    const field = await titleIn(noteA());
    const view = await editorView(noteA());
    const depth = undoDepth(view.state);

    await user.click(field);
    await user.type(field, ' back');
    await user.paste(' today');
    await user.keyboard('{Control>}z{/Control}{Meta>}z{/Meta}');
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await user.keyboard('{Backspace}{Delete}{Home}{ArrowRight}');
    await user.keyboard('{Control>}a{/Control}');
    await user.clear(field);
    await user.type(field, 'Call Sam back');

    expect(view.state.doc.toString()).toBe(body);
    expect(undoDepth(view.state)).toBe(depth);
    expect(onChange).not.toHaveBeenCalled();
    expect(api.taskPuts).toEqual([]);

    await user.tab();

    await waitFor(() => expect(api.taskPuts).toHaveLength(1));
    expect(api.taskPuts[0]).toMatchObject({
      version: 1,
      title: 'Call Sam back',
    });
    expect(api.tasks.get(TASK_ID)?.title).toBe('Call Sam back');
    await waitFor(() =>
      expect(within(noteB()).getByDisplayValue('Call Sam back')).toBeTruthy(),
    );
    expect(view.state.doc.toString()).toBe(body);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('an emptied title reverts on blur without saving', async () => {
    seedTask();
    renderNotes(tokenLine(TASK_ID));
    const user = userEvent.setup();
    const field = await titleIn(noteA());

    await user.clear(field);
    expect(field).toHaveValue('');
    await user.tab();

    expect(field).toHaveValue('Call Sam');
    expect(api.taskPuts).toEqual([]);
  });

  test('Enter saves and puts the caret on a new line under the embed', async () => {
    seedTask();
    const body = `Standup\n${tokenLine(TASK_ID)}`;
    const { onChange } = renderNotes(body);
    const user = userEvent.setup();
    const field = await titleIn(noteA());
    const view = await editorView(noteA());

    await user.clear(field);
    await user.type(field, 'Call Sam back{Enter}');

    await waitFor(() =>
      expect(api.taskPuts).toEqual([
        expect.objectContaining({ title: 'Call Sam back' }),
      ]),
    );
    expect(view.state.doc.toString()).toBe(`${body}\n`);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(view.hasFocus).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(`${body}\n`);
  });

  test('Enter reuses a blank line under the embed instead of adding one', async () => {
    seedTask();
    const body = `${tokenLine(TASK_ID)}\n\nnext`;
    renderNotes(body);
    const user = userEvent.setup();
    const field = await titleIn(noteA());
    const view = await editorView(noteA());

    await user.click(field);
    await user.keyboard('{Enter}');

    expect(view.state.doc.toString()).toBe(body);
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(
      2,
    );
    expect(view.hasFocus).toBe(true);
    expect(api.taskPuts).toEqual([]);
  });

  test('Escape drops the edit and returns to the embed line', async () => {
    seedTask();
    const body = `Standup\n${tokenLine(TASK_ID)}\nnotes`;
    renderNotes(body);
    const user = userEvent.setup();
    const field = await titleIn(noteA());
    const view = await editorView(noteA());

    await user.type(field, ' later{Escape}');

    // The caret on the embed's line redraws the widget, so query it again.
    expect(await titleIn(noteA())).toHaveValue('Call Sam');
    expect(view.state.doc.toString()).toBe(body);
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).to);
    expect(view.hasFocus).toBe(true);
    expect(api.taskPuts).toEqual([]);
  });

  describe('from the keyboard', () => {
    const body = `Standup\n${tokenLine(TASK_ID)}\nnotes`;

    test('arrowing onto the embed line puts the caret in its title', async () => {
      seedTask();
      renderNotes(body);
      await titleIn(noteA());
      const view = await editorView(noteA());

      act(() => {
        view.focus();
        view.dispatch({
          selection: { anchor: view.state.doc.line(2).from },
          userEvent: 'select',
        });
      });

      const field = await titleIn(noteA());
      await waitFor(() => expect(field).toHaveFocus());
      expect(field.selectionStart).toBe(0);
    });

    test('arrow keys in the title leave for the lines above and below', async () => {
      seedTask();
      renderNotes(body);
      const user = userEvent.setup();
      const view = await editorView(noteA());

      await user.click(await titleIn(noteA()));
      await user.keyboard('{ArrowUp}');
      expect(view.hasFocus).toBe(true);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(1).to);

      await user.click(await titleIn(noteA()));
      await user.keyboard('{ArrowDown}');
      expect(view.hasFocus).toBe(true);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(3).from);
      expect(view.state.doc.toString()).toBe(body);
    });

    test('typing beside the row goes into the title, not the token', async () => {
      seedTask();
      const { onChange } = renderNotes(body);
      const user = userEvent.setup();
      await titleIn(noteA());
      const view = await editorView(noteA());

      act(() => {
        view.focus();
        const end = view.state.doc.line(2).to;
        view.dispatch({
          changes: { from: end, insert: '!' },
          selection: { anchor: end + 1 },
          userEvent: 'input.type',
        });
      });

      const field = await titleIn(noteA());
      await waitFor(() => expect(field).toHaveValue('Call Sam!'));
      expect(field).toHaveFocus();
      expect(view.state.doc.toString()).toBe(body);
      expect(onChange).not.toHaveBeenCalled();

      await user.tab();
      await waitFor(() =>
        expect(api.tasks.get(TASK_ID)?.title).toBe('Call Sam!'),
      );
    });

    test('Backspace at the start of the next line goes into the title instead of joining', async () => {
      seedTask();
      renderNotes(body);
      await titleIn(noteA());
      const view = await editorView(noteA());
      act(() => {
        view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
      });

      press(view, 'Backspace');

      expect(view.state.doc.toString()).toBe(body);
      const field = await titleIn(noteA());
      await waitFor(() => expect(field).toHaveFocus());
      expect(field.selectionStart).toBe('Call Sam'.length);
    });

    test('Backspace on an empty line under the row removes the line', async () => {
      seedTask();
      renderNotes(`Standup\n${tokenLine(TASK_ID)}\n`);
      await titleIn(noteA());
      const view = await editorView(noteA());
      act(() => {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
      });

      press(view, 'Backspace');

      expect(view.state.doc.toString()).toBe(`Standup\n${tokenLine(TASK_ID)}`);
      await waitFor(async () => expect(await titleIn(noteA())).toHaveFocus());
    });
  });

  test('a done task stays struck through and can still be renamed', async () => {
    seedTask({ status: 'done', completedAt: TS });
    renderNotes(tokenLine(TASK_ID));
    const user = userEvent.setup();
    const field = await titleIn(noteA());
    expect(field.closest('.task-embed')).toHaveClass('task-embed--done');

    await user.clear(field);
    await user.type(field, 'Called Sam{Enter}');

    await waitFor(() =>
      expect(api.tasks.get(TASK_ID)?.title).toBe('Called Sam'),
    );
  });

  test('a conflicting save says so and puts the title back', async () => {
    seedTask({ version: 3 });
    renderNotes(tokenLine(TASK_ID));
    const user = userEvent.setup();
    const field = await titleIn(noteA());
    api.tasks.set(TASK_ID, { ...api.tasks.get(TASK_ID)!, version: 4 });

    await user.clear(field);
    await user.type(field, 'Call Sam back');
    await user.tab();

    expect(
      await within(noteA()).findByText(/changed on another device/),
    ).toBeTruthy();
    await waitFor(() => expect(field).toHaveValue('Call Sam'));
  });
});
