import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import type { Note, NoteTemplate, Task } from '@gagnechris/app-core';
import { QueryClientTestProvider, workOutletContext } from '../test-utils';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';
import NotebookTaskPage from './NotebookTaskPage';
import NotebookTodayPage from './NotebookTodayPage';
import { resetTaskDetailsStore } from './taskDetailsStore';

const TODAY = '2026-10-02';
const TS = '2026-10-02T12:00:00.000Z';
const TASK_ID = '01JTASKAAAAAAAAAAAAAAAAAAA';

const api = vi.hoisted(() => ({
  daily: null as Note | null,
  notes: new Map<string, Note>(),
  tasks: new Map<string, Task>(),
  templates: [] as NoteTemplate[],
  puts: [] as string[],
  taskPuts: [] as Record<string, unknown>[],
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
const notFound = () => ({
  data: undefined,
  error: { error: 'not_found', message: 'not_found' },
  response: { status: 404 },
});

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (path: string, init?: Init) => {
        const p = init?.params?.path ?? {};
        if (path === '/api/notebook/templates/notes') {
          return ok({ items: api.templates });
        }
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
          return task ? ok(task) : notFound();
        }
        if (path === '/api/notebook/tasks') return ok({ items: [] });
        if (path === '/api/notebook/notes') return ok({ items: [] });
        return notFound();
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
            bodyMarkdown: String(body.bodyMarkdown ?? ''),
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
          const { version: _version, ...fields } = body;
          const next = { ...prev, ...fields, version: prev.version + 1 };
          api.tasks.set(next.id, next);
          return ok(next);
        }
        return notFound();
      },
      POST: async (path: string, init?: Init) => {
        const body = init?.body ?? {};
        if (path === '/api/notebook/tasks/batch') {
          const ids = body.ids as string[];
          return ok({
            items: ids.flatMap((id) => {
              const task = api.tasks.get(id);
              return task ? [task] : [];
            }),
          });
        }
        if (path === '/api/notebook/tasks') {
          if (!api.notes.has(String(body.noteId))) {
            return {
              data: undefined,
              error: {
                error: 'bad_request',
                message: 'noteId must reference an existing note',
                fields: { noteId: 'not_found' },
              },
              response: { status: 400 },
            };
          }
          const id = String(body.id);
          const task: Task = {
            id,
            userId: 'u1',
            area: body.area as Task['area'],
            title: String(body.title),
            description: '',
            priority: 'med',
            status: 'todo',
            dueDate: null,
            startDate: null,
            someday: false,
            completedAt: null,
            noteId: String(body.noteId),
            parentId: null,
            tags: [],
            version: 1,
            createdAt: TS,
            updatedAt: TS,
            deleted: false,
          };
          api.tasks.set(id, api.tasks.get(id) ?? task);
          return ok(api.tasks.get(id)!, 201);
        }
        return notFound();
      },
    }),
}));

const template = (
  id: string,
  name: string,
  bodyMarkdown: string,
): NoteTemplate => ({
  id,
  name,
  bodyMarkdown,
  version: 1,
  createdAt: TS,
  updatedAt: TS,
});

const HM_SCREEN = template(
  '01JTMPAAAAAAAAAAAAAAAAAAA1',
  'HM Screen Interview',
  '## Screen · {{weekday}}\n\n[ ] Send feedback\n[ ] Book debrief\n\nNotes:\n',
);
const ONE_ON_ONE = template(
  '01JTMPAAAAAAAAAAAAAAAAAAA2',
  '1:1',
  '- Wins\n- Blockers\n',
);

const seedTask = (noteId: string | null) =>
  api.tasks.set(TASK_ID, {
    id: TASK_ID,
    userId: 'u1',
    area: 'work',
    title: 'Hire a designer',
    description: '',
    priority: 'med',
    status: 'todo',
    dueDate: null,
    startDate: null,
    someday: false,
    completedAt: null,
    noteId,
    parentId: null,
    tags: [],
    version: 1,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
  });

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

const KEY_CODES = { Enter: 13, Escape: 27, ArrowDown: 40 } as const;

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

const optionNames = (listbox: HTMLElement) =>
  within(listbox)
    .getAllByRole('option')
    .map((o) => o.firstElementChild?.textContent);

const tokenIds = (markdown: string) =>
  [...markdown.matchAll(/\{\{task:([0-9A-Z]{26})\}\}/g)].map((m) => m[1]);

beforeAll(() => {
  const empty = () => [] as unknown as DOMRectList;
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
});

beforeEach(() => {
  api.daily = null;
  api.notes.clear();
  api.tasks.clear();
  api.templates = [HM_SCREEN, ONE_ON_ONE];
  api.puts = [];
  api.taskPuts = [];
  localStorage.clear();
  resetTaskDetailsStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderToday() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={workOutletContext} />,
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

const TEMPLATE_TEXT =
  '## Screen · Friday\n\n{{task:A}}\n{{task:B}}\n\nNotes:\n';

/** The doc with each task token named in order, so ids don't matter. */
const withNamedTokens = (doc: string) => {
  const names = ['A', 'B', 'C'];
  let i = 0;
  return doc.replace(
    /\{\{task:[0-9A-Z]{26}\}\}/g,
    () => `{{task:${names[i++]}}}`,
  );
};

describe('templates in a daily note', () => {
  test('/ on an empty line lists templates; Enter inserts the filtered one and its task lines become tasks', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, 'Intro\n/');
    const listbox = await screen.findByRole('listbox', {
      name: 'Insert template',
    });
    expect(optionNames(listbox)).toEqual(['1:1', 'HM Screen Interview']);
    expect(view.contentDOM).toHaveAttribute('aria-controls', listbox.id);

    typeInto(view, 'hm');
    await waitFor(() =>
      expect(
        optionNames(screen.getByRole('listbox', { name: 'Insert template' })),
      ).toEqual(['HM Screen Interview']),
    );
    press(view, 'Enter');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await waitFor(() => expect(api.tasks.size).toBe(2), { timeout: 5000 });
    expect(withNamedTokens(view.state.doc.toString())).toBe(
      `Intro\n${TEMPLATE_TEXT}`,
    );
    const ids = tokenIds(view.state.doc.toString());
    expect(ids.map((id) => api.tasks.get(id!)?.title)).toEqual([
      'Send feedback',
      'Book debrief',
    ]);
    for (const id of ids) {
      expect(api.tasks.get(id!)).toMatchObject({
        noteId: api.daily!.id,
        area: 'work',
      });
    }
  });

  test('Escape closes the menu and keeps the /; a / mid-line opens nothing', async () => {
    const { container } = renderToday();
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '/');
    await screen.findByRole('listbox', { name: 'Insert template' });
    press(view, 'Escape');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    typeInto(view, '1');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    typeInto(view, '\nand/or');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    press(view, 'Enter');
    expect(view.state.doc.toString()).toBe('/1\nand/or\n');
  });

  test('Insert template… in the ⋯ menu inserts the chosen template and makes its tasks', async () => {
    const { container } = renderToday();
    const view = await editorView(container);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Note options' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Insert template…' }));
    const filter = await screen.findByRole('combobox', {
      name: 'Filter templates',
    });
    fireEvent.change(filter, { target: { value: 'screen' } });
    fireEvent.keyDown(filter, { key: 'Enter' });

    await waitFor(() => expect(api.tasks.size).toBe(2), { timeout: 5000 });
    expect(withNamedTokens(view.state.doc.toString())).toBe(TEMPLATE_TEXT);
    expect(
      tokenIds(view.state.doc.toString()).map(
        (id) => api.tasks.get(id!)?.title,
      ),
    ).toEqual(['Send feedback', 'Book debrief']);
    expect(view.hasFocus).toBe(true);
    expect(
      screen.queryByRole('combobox', { name: 'Filter templates' }),
    ).not.toBeInTheDocument();
  });
});

describe('templates on a task page', () => {
  test('/ inserts a template into the description', async () => {
    seedTask(null);
    const router = createMemoryRouter(
      [{ path: 'tasks/:id', element: <NotebookTaskPage /> }],
      { initialEntries: [`/tasks/${TASK_ID}`] },
    );
    const { container } = render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
    const view = await editorView(container);
    act(() => view.focus());

    typeInto(view, '/1');
    const listbox = await screen.findByRole('listbox', {
      name: 'Insert template',
    });
    expect(optionNames(listbox)).toEqual(['1:1']);
    fireEvent.click(within(listbox).getByRole('option'));
    expect(view.state.doc.toString()).toBe('- Wins\n- Blockers\n');
    await waitFor(
      () =>
        expect(api.taskPuts.at(-1)).toMatchObject({
          description: '- Wins\n- Blockers\n',
        }),
      { timeout: 5000 },
    );
  });
});

describe('templates in a task’s details inside a note', () => {
  test('/ inserts a template into the description and saves it to the task', async () => {
    const DAILY_ID = '01JNOTEAAAAAAAAAAAAAAAAAAA';
    seedTask(DAILY_ID);
    api.daily = {
      id: DAILY_ID,
      userId: 'u1',
      area: 'work',
      type: 'daily',
      date: TODAY,
      title: '',
      bodyMarkdown: `{{task:${TASK_ID}}}\n`,
      tags: [],
      pinned: false,
      taskIds: [TASK_ID],
      version: 1,
      createdAt: TS,
      updatedAt: TS,
      deleted: false,
    };
    api.notes.set(DAILY_ID, api.daily);
    renderToday();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Show details for Hire a designer',
      }),
    );
    const panel = await screen.findByRole('group', {
      name: 'Details for Hire a designer',
    });
    const view = await editorView(panel);
    act(() => view.focus());

    typeInto(view, '/hm');
    const listbox = await screen.findByRole('listbox', {
      name: 'Insert template',
    });
    expect(optionNames(listbox)).toEqual(['HM Screen Interview']);
    press(view, 'Enter');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const description =
      '## Screen · Friday\n\n[ ] Send feedback\n[ ] Book debrief\n\nNotes:\n';
    expect(view.state.doc.toString()).toBe(description);
    await waitFor(
      () => expect(api.tasks.get(TASK_ID)?.description).toBe(description),
      { timeout: 5000 },
    );
    expect(api.taskPuts.at(-1)).toEqual({ version: 1, description });
    expect(api.tasks.size).toBe(1);
    expect(api.daily.bodyMarkdown).toBe(`{{task:${TASK_ID}}}\n`);
  });
});
