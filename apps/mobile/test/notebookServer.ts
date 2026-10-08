import type { Note } from '@gagnechris/app-core';

export const makeNote = (id: string, bodyMarkdown: string): Note => ({
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
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * The Notebook routes the cache tests touch, behind a `fetch` that fails like
 * React Native's does with no connection.
 */
export const notebookServer = (notes: Note[]) => {
  const store = new Map(notes.map((note) => [note.id, note]));
  const state = {
    store,
    offline: false,
    /** Apply the next PUT, then fail as if its response was lost. */
    loseNextResponse: false,
    /** Every request, reached the server or not. */
    calls: [] as string[],
    requests: [] as string[],
    writes: 0,
    conflicts: 0,
  };
  const fetch = async (input: Request): Promise<Response> => {
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
    if (state.offline) {
      throw new TypeError('Network request failed');
    }
    state.requests.push(route);
    const detail = url.pathname.match(/^\/api\/notebook\/notes\/([^/]+)$/);
    if (route === 'GET /api/notebook/notes') {
      return json(200, { items: [...store.values()] });
    }
    if (route === 'POST /api/notebook/search') {
      return json(200, { items: [] });
    }
    if (detail && input.method === 'GET') {
      const note = store.get(detail[1]!);
      return note ? json(200, note) : json(404, { error: 'not_found' });
    }
    if (detail && input.method === 'PUT') {
      const note = store.get(detail[1]!)!;
      const body = (await input.json()) as Partial<Note> & { version: number };
      if (body.version !== note.version) {
        state.conflicts += 1;
        return json(412, { error: 'version_conflict', current: note });
      }
      const { version: _version, ...fields } = body;
      const next = { ...note, ...fields, version: note.version + 1 };
      store.set(note.id, next);
      state.writes += 1;
      if (state.loseNextResponse) {
        state.loseNextResponse = false;
        throw new TypeError('Network request failed');
      }
      return json(200, next);
    }
    return json(404, { error: 'not_found' });
  };
  return { state, fetch };
};
