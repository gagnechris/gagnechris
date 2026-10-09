import type { Note, Task } from '@gagnechris/app-core';
import {
  CLIENT_VERSION_HEADER,
  isClientVersionSupported,
  isOpenTaskStatus,
  parseClientVersion,
  replaceTaskEmbeds,
  taskEmbedFallbackLine,
  taskShowsOn,
} from '@gagnechris/shared';

export const makeNote = (
  id: string,
  bodyMarkdown: string,
  fields: Partial<Note> = {},
): Note => ({
  id,
  userId: 'u1',
  area: 'work',
  type: 'page',
  date: null,
  title: `Note ${id}`,
  bodyMarkdown,
  tags: [],
  pinned: false,
  taskIds: [],
  version: 1,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  deleted: false,
  ...fields,
});

export const makeTask = (
  id: string,
  title: string,
  fields: Partial<Task> = {},
): Task => ({
  id,
  userId: 'u1',
  area: 'work',
  title,
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  deleted: false,
  ...fields,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const isOpen = (task: Task) => isOpenTaskStatus(task.status);

/** Pages of `limit` (default 50) through a numeric cursor, as the API pages. */
const page = <T>(items: T[], params: URLSearchParams) => {
  const limit = Number(params.get('limit') ?? 50);
  const start = Number(params.get('cursor') ?? 0);
  const slice = items.slice(start, start + limit);
  const next = start + limit < items.length ? String(start + limit) : undefined;
  return { items: slice, ...(next ? { nextCursor: next } : {}) };
};

const matchesNote = (note: Note, params: URLSearchParams) => {
  const area = params.get('area');
  const type = params.get('type');
  const from = params.get('from');
  const to = params.get('to');
  if (note.deleted) return false;
  if (area && note.area !== area) return false;
  if (type && note.type !== type) return false;
  if (from && (!note.date || note.date < from)) return false;
  if (to && (!note.date || note.date > to)) return false;
  return true;
};

const matchesTask = (task: Task, params: URLSearchParams) => {
  const get = (key: string) => params.get(key);
  if (task.deleted) return false;
  if (get('area') && task.area !== get('area')) return false;
  if (get('status') && task.status !== get('status')) return false;
  if (get('open') === 'true' && !isOpen(task)) return false;
  if (get('noteId') && task.noteId !== get('noteId')) return false;
  if (get('someday') === 'true' && !task.someday) return false;
  const start = task.startDate;
  if (get('startOn') && start !== get('startOn')) return false;
  // As the API's index: unscheduled open tasks show on every day.
  if (get('startOnOrBefore') && !taskShowsOn(task, get('startOnOrBefore')!))
    return false;
  if (get('startAfter') && (!start || start <= get('startAfter')!))
    return false;
  if (get('startBefore') && (!start || start >= get('startBefore')!))
    return false;
  return true;
};

/**
 * The Notebook API behind a `fetch` that fails like React Native's does with
 * no connection. Enough of each route for the screens and cache tests.
 */
export const notebookServer = (notes: Note[], tasks: Task[] = []) => {
  const store = new Map(notes.map((note) => [note.id, note]));
  const taskStore = new Map(tasks.map((task) => [task.id, task]));
  const state = {
    store,
    taskStore,
    offline: false,
    /** Apply the next PUT, then fail as if its response was lost. */
    loseNextResponse: false,
    /** Every request, reached the server or not. */
    calls: [] as string[],
    requests: [] as string[],
    writes: 0,
    conflicts: 0,
    /** `x-gagnechris-client-version` of every request. */
    clientVersions: [] as (string | null)[],
    /** The sync feed answers 426 below it. */
    minClientVersion: null as string | null,
    /** The sync feed answers 410 for a `since` older than this. */
    resyncBefore: null as string | null,
  };
  let clock = Date.parse('2026-10-02T12:00:00.000Z');
  const now = () => new Date((clock += 1_000)).toISOString();

  const put = <T extends { version: number }>(
    map: Map<string, T>,
    current: T,
    body: Partial<T> & { version?: number },
  ): Response | T => {
    if (body.version !== undefined && body.version !== current.version) {
      state.conflicts += 1;
      return json(412, { error: 'version_conflict', current });
    }
    const { version: _version, ...fields } = body;
    const next = {
      ...current,
      ...fields,
      version: current.version + 1,
      updatedAt: now(),
    } as T;
    map.set((current as unknown as { id: string }).id, next);
    state.writes += 1;
    return next;
  };

  /** A write from another device: bumps the version and the feed position. */
  const remoteEdit = <T extends Note | Task>(
    map: Map<string, T>,
    id: string,
    fields: Partial<T>,
  ): T => {
    const current = map.get(id)!;
    const next = {
      ...current,
      ...fields,
      version: current.version + 1,
      updatedAt: now(),
    };
    map.set(id, next);
    return next;
  };

  const syncChanges = (params: URLSearchParams) => {
    const watermark = now();
    const since = params.get('since');
    const entries = [
      ...[...store.values()].map((entity) => ['note', entity] as const),
      ...[...taskStore.values()].map((entity) => ['task', entity] as const),
    ]
      .filter(([, entity]) => !since || entity.updatedAt >= since)
      .sort(([, a], [, b]) => a.updatedAt.localeCompare(b.updatedAt))
      .map(([type, entity]) => ({
        type,
        id: entity.id,
        version: entity.version,
        updatedAt: entity.updatedAt,
        ...(entity.deleted ? { deleted: true } : { deleted: false, entity }),
      }));
    const { items, nextCursor } = page(entries, params);
    return {
      changes: items,
      ...(nextCursor ? { nextCursor } : {}),
      nextSince: watermark,
    };
  };

  const fetch = async (input: Request): Promise<Response> => {
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
    if (state.offline) {
      throw new TypeError('Network request failed');
    }
    state.requests.push(route);
    const clientVersion = input.headers.get(CLIENT_VERSION_HEADER);
    state.clientVersions.push(clientVersion);
    const params = url.searchParams;
    const note = url.pathname.match(/^\/api\/notebook\/notes\/([^/]+)$/);
    const daily = url.pathname.match(
      /^\/api\/notebook\/notes\/daily\/(work|personal)\/([\d-]+)(\/open)?$/,
    );
    const task = url.pathname.match(
      /^\/api\/notebook\/tasks\/([^/]+)(\/complete|\/reopen)?$/,
    );

    if (route === 'GET /api/notebook/sync/changes') {
      const minimum = state.minClientVersion;
      if (
        minimum &&
        clientVersion &&
        !isClientVersionSupported(
          parseClientVersion(clientVersion)!,
          parseClientVersion(minimum)!,
        )
      ) {
        return json(426, {
          error: 'upgrade_required',
          message: 'Upgrade required',
          minClientVersion: minimum,
        });
      }
      const since = params.get('since');
      if (since && state.resyncBefore && since < state.resyncBefore) {
        return json(410, {
          error: 'resync_required',
          message: 'Full resync required',
        });
      }
      return json(200, syncChanges(params));
    }
    if (route === 'GET /api/notebook/notes') {
      const all = [...store.values()].filter((n) => matchesNote(n, params));
      return json(200, page(all, params));
    }
    if (route === 'POST /api/notebook/notes') {
      const body = (await input.json()) as Partial<Note> & { id: string };
      const created = makeNote(body.id, body.bodyMarkdown ?? '', {
        ...body,
        createdAt: now(),
        updatedAt: now(),
      });
      store.set(created.id, created);
      state.writes += 1;
      return json(201, created);
    }
    if (route === 'POST /api/notebook/notes/batch') {
      const { ids } = (await input.json()) as { ids: string[] };
      return json(200, {
        items: ids.map((id) => store.get(id)).filter(Boolean),
      });
    }
    if (route === 'POST /api/notebook/tasks/batch') {
      const { ids } = (await input.json()) as { ids: string[] };
      return json(200, {
        items: ids.map((id) => taskStore.get(id)).filter(Boolean),
      });
    }
    if (route === 'POST /api/notebook/search') {
      const { q, area } = (await input.json()) as { q: string; area?: string };
      const needle = q.toLowerCase();
      // As the API: embeds read as the task's line, never the raw token.
      const searchable = (n: Note) =>
        replaceTaskEmbeds(n.bodyMarkdown, (embed) => {
          const t = taskStore.get(embed.id);
          return t ? taskEmbedFallbackLine(embed, t) : '';
        });
      const hit = (
        type: 'note' | 'task',
        item: { id: string; area: Note['area']; title: string },
        text: string,
        date?: string | null,
        extra: object = {},
      ) => ({
        type,
        id: item.id,
        area: item.area,
        title: item.title,
        ...(date ? { date } : {}),
        snippet: text.slice(0, 80).replace(/\s+/g, ' ').trim(),
        matches: [],
        ...extra,
      });
      return json(200, {
        notes: [...store.values()]
          .filter(
            (n) =>
              !n.deleted &&
              (!area || n.area === area) &&
              `${n.title}\n${searchable(n)}`.toLowerCase().includes(needle),
          )
          .map((n) => hit('note', n, searchable(n), n.date)),
        tasks: [...taskStore.values()]
          .filter(
            (t) =>
              !t.deleted &&
              (!area || t.area === area) &&
              `${t.title}\n${t.description}`.toLowerCase().includes(needle),
          )
          .map((t) =>
            hit('task', t, t.description || t.title, null, {
              status: t.status,
              version: t.version,
            }),
          ),
      });
    }
    if (daily) {
      const [, area, date, open] = daily;
      const existing = [...store.values()].find(
        (n) =>
          !n.deleted &&
          n.type === 'daily' &&
          n.area === area &&
          n.date === date,
      );
      if (input.method === 'GET' || open) {
        return json(
          200,
          existing ?? {
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
        );
      }
      if (input.method === 'PUT') {
        const body = (await input.json()) as Partial<Note> & {
          id?: string;
          version?: number;
        };
        // A first write sends no version; if another device created the day
        // meanwhile, it loses the claim.
        if (existing && body.version === undefined && body.id !== existing.id) {
          state.conflicts += 1;
          return json(409, { error: 'daily_taken', current: existing });
        }
        if (existing) {
          const result = put(store, existing, body);
          return result instanceof Response ? result : json(200, result);
        }
        if (body.version !== undefined && body.version !== 0) {
          state.conflicts += 1;
          return json(412, { error: 'version_conflict' });
        }
        const created = makeNote(
          body.id ?? `d-${date}`,
          body.bodyMarkdown ?? '',
          {
            area: area as Note['area'],
            type: 'daily',
            date: date!,
            title: '',
            createdAt: now(),
            updatedAt: now(),
          },
        );
        store.set(created.id, created);
        state.writes += 1;
        return json(200, created);
      }
    }
    if (note && input.method === 'GET') {
      const found = store.get(note[1]!);
      return found && !found.deleted
        ? json(200, found)
        : json(404, { error: 'not_found' });
    }
    if (note && input.method === 'PUT') {
      const current = store.get(note[1]!);
      if (!current) return json(404, { error: 'not_found' });
      const body = (await input.json()) as Partial<Note> & { version: number };
      const result = put(store, current, body);
      if (result instanceof Response) return result;
      if (state.loseNextResponse) {
        state.loseNextResponse = false;
        throw new TypeError('Network request failed');
      }
      return json(200, result);
    }
    if (note && input.method === 'DELETE') {
      const current = store.get(note[1]!);
      if (!current) return json(404, { error: 'not_found' });
      const result = put(store, current, {
        ...((await input.json()) as { version: number }),
        deleted: true,
      } as Partial<Note> & { version: number });
      return result instanceof Response ? result : json(200, result);
    }

    if (route === 'GET /api/notebook/tasks') {
      const all = [...taskStore.values()].filter((t) => matchesTask(t, params));
      return json(200, page(all, params));
    }
    if (route === 'POST /api/notebook/tasks') {
      const body = (await input.json()) as Partial<Task> & {
        id: string;
        title: string;
      };
      const created = makeTask(body.id, body.title, {
        ...body,
        createdAt: now(),
        updatedAt: now(),
      });
      taskStore.set(created.id, created);
      state.writes += 1;
      return json(201, created);
    }
    if (task) {
      const [, id, action] = task;
      const current = taskStore.get(id!);
      if (!current || (current.deleted && input.method !== 'GET'))
        return json(404, { error: 'not_found' });
      if (input.method === 'GET') {
        return current.deleted
          ? json(404, { error: 'not_found' })
          : json(200, current);
      }
      const body = (await input.json()) as Partial<Task> & { version: number };
      const fields: Partial<Task> & { version: number } =
        action === '/complete'
          ? { version: body.version, status: 'done', completedAt: now() }
          : action === '/reopen'
            ? { version: body.version, status: 'todo', completedAt: null }
            : input.method === 'DELETE'
              ? { version: body.version, deleted: true }
              : body;
      const result = put(taskStore, current, fields);
      return result instanceof Response ? result : json(200, result);
    }
    return json(404, { error: 'not_found' });
  };
  return {
    state,
    fetch,
    editNote: (id: string, fields: Partial<Note>) =>
      remoteEdit(store, id, fields),
    editTask: (id: string, fields: Partial<Task>) =>
      remoteEdit(taskStore, id, fields),
  };
};
