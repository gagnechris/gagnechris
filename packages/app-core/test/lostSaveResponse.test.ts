import type { ApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import type { Note, Post } from '../src/query/api.js';
import { noteResource } from '../src/query/notes.js';
import { postResource } from '../src/query/posts.js';
import { useVersionedDocEditor } from '../src/useVersionedDocEditor.js';
import { useVersionedEntityEditor } from '../src/useVersionedEntityEditor.js';
import { act, renderHook } from './renderHook.js';

const CONFLICT = 'Conflict - reload and try again.';

const waitUntil = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Timed out waiting for ${label}`);
};

type Versioned = { version: number } & Record<string, unknown>;

/**
 * Applies a PUT whose version matches, like the API. `loseNextResponse` makes
 * the next applied PUT reject as a network failure after it has been stored.
 */
const fakeServer = <T extends Versioned>(
  initial: T,
  conflict: { status: number; error: string },
) => {
  let stored: Versioned = { ...initial };
  let loseNext = false;
  let inFlight = 0;
  let maxInFlight = 0;
  const puts: Versioned[] = [];
  const client = {
    GET: vi.fn(async () => ({
      data: { ...stored },
      error: undefined,
      response: { status: 200 },
    })),
    PUT: vi.fn(async (_path: string, { body }: { body: Versioned }) => {
      puts.push(body);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      if (body.version !== stored.version) {
        return {
          data: undefined,
          error: {
            error: conflict.error,
            message: 'Version conflict',
            currentVersion: stored.version,
            current: { ...stored },
          },
          response: { status: conflict.status },
        };
      }
      const next: Versioned = { ...stored, version: stored.version + 1 };
      for (const [key, value] of Object.entries(body)) {
        if (key === 'version') continue;
        // The API stores a cleared field by omitting it.
        if (value === null) delete next[key];
        else next[key] = value;
      }
      stored = next;
      if (loseNext) {
        loseNext = false;
        throw new TypeError('Failed to fetch');
      }
      return {
        data: { ...stored },
        error: undefined,
        response: { status: 200 },
      };
    }),
  } as unknown as ApiClient;
  return {
    client,
    puts,
    stored: () => stored,
    maxInFlight: () => maxInFlight,
    editElsewhere: (fields: Record<string, unknown>) => {
      stored = { ...stored, ...fields, version: stored.version + 1 };
    },
    loseNextResponse: () => {
      loseNext = true;
    },
  };
};

const wrapperFor =
  (client: ApiClient) =>
  ({ children }: { children: ReactNode }) =>
    createElement(AppApiProvider, {
      getClient: () => client,
      children: createElement(QueryClientProvider, {
        client: new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
        children,
      }),
    });

const note: Note = {
  id: '01TESTLOSTRESPONSENOTE0001',
  userId: 'u1',
  area: 'work',
  type: 'page',
  date: null,
  title: 'Plan',
  bodyMarkdown: 'hello',
  tags: [],
  pinned: false,
  taskIds: [],
  version: 1,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  deleted: false,
};

const post: Post = {
  id: '01POSTLOSTRESPONSE',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: 'hello',
  tags: [],
  projectIds: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-10-07T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

type Body = { body: string };

const signalHub = () => {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire: () => {
      for (const listener of [...listeners]) listener();
    },
  };
};

type Hub = ReturnType<typeof signalHub>;

type EditorHandle = {
  isLoading: boolean;
  dirty: boolean;
  saveState: string;
  saveError: string | null;
  entity: { version: number } | null;
  updateDraft: (update: (prev: Body) => Body) => void;
  save: () => Promise<string>;
};

const renderNotebookEditor = (hub?: Hub) => {
  const server = fakeServer(note, {
    status: 412,
    error: 'precondition_failed',
  });
  const { result } = renderHook(
    (): EditorHandle =>
      useVersionedDocEditor({
        resource: noteResource,
        params: { id: note.id },
        initialDraft: { body: '' },
        toDraft: (n) => ({ body: n.bodyMarkdown }),
        getEntityId: (n) => n.id,
        toPayload: (draft) => ({
          title: 'Plan',
          bodyMarkdown: draft.body,
          tags: [],
          pinned: false,
        }),
        conflictMessage: CONFLICT,
        confirm: async () => true,
        retrySignals: hub?.subscribe,
      }),
    { wrapper: wrapperFor(server.client) },
  );
  return { server, result };
};

const renderSiteEditor = (hub?: Hub) => {
  const server = fakeServer(post, { status: 409, error: 'conflict' });
  const { result } = renderHook(
    (): EditorHandle =>
      useVersionedEntityEditor({
        resource: postResource,
        params: { id: post.id },
        initialDraft: { body: '' },
        toDraft: (p) => ({ body: p.bodyMarkdown }),
        getEntityId: (p) => p.id,
        toPayload: (draft) => ({
          title: 'Hello',
          slug: 'hello',
          bodyMarkdown: draft.body,
          tags: [],
          coverImage: null,
          seo: null,
        }),
        conflictMessage: CONFLICT,
        confirm: async () => true,
        unpublishConfirm: 'Unpublish?',
        discardConfirm: 'Discard?',
        retrySignals: hub?.subscribe,
      }),
    { wrapper: wrapperFor(server.client) },
  );
  return { server, result };
};

const save = async (result: { current: EditorHandle }) => {
  let outcome = '';
  await act(async () => {
    outcome = await result.current.save();
  });
  return outcome;
};

const editAndLoseResponse = async (
  render: typeof renderNotebookEditor,
  text: string,
  hub?: Hub,
) => {
  const rendered = render(hub);
  const { result, server } = rendered;
  await waitUntil(() => !result.current.isLoading, 'hydrate');
  act(() => {
    result.current.updateDraft(() => ({ body: text }));
  });
  server.loseNextResponse();
  expect(await save(result)).toBe('error');
  expect(result.current.saveState).toBe('error');
  expect(server.stored()).toMatchObject({ bodyMarkdown: text, version: 2 });
  return rendered;
};

describe.each([
  {
    name: 'Notebook note (412)',
    render: renderNotebookEditor,
  },
  { name: 'site post (409)', render: renderSiteEditor },
])('retry after a lost save response: $name', ({ render }) => {
  test('a conflict whose current holds the sent fields resolves as saved', async () => {
    const { result, server } = await editAndLoseResponse(render, 'edited');

    expect(await save(result)).toBe('clean');
    expect(server.puts.map((p) => p.version)).toEqual([1, 1]);
    expect(result.current.saveState).toBe('saved');
    expect(result.current.saveError).toBeNull();
    expect(result.current.dirty).toBe(false);
    expect(result.current.entity?.version).toBe(2);

    act(() => {
      result.current.updateDraft(() => ({ body: 'edited again' }));
    });
    expect(await save(result)).toBe('clean');
    expect(server.puts.at(-1)?.version).toBe(2);
    expect(server.stored()).toMatchObject({
      bodyMarkdown: 'edited again',
      version: 3,
    });
    expect(result.current.saveError).toBeNull();
  });

  test('a conflict whose current differs still surfaces as a conflict', async () => {
    const { result, server } = await editAndLoseResponse(render, 'edited');
    server.editElsewhere({ bodyMarkdown: 'from another device' });

    expect(await save(result)).toBe('error');
    expect(result.current.saveState).toBe('error');
    expect(result.current.saveError).toBe(CONFLICT);
    expect(result.current.dirty).toBe(true);
    expect(server.stored()).toMatchObject({
      bodyMarkdown: 'from another device',
      version: 3,
    });
  });

  test('edits typed after the lost save are saved on reconnect, with no conflict', async () => {
    const hub = signalHub();
    const { result, server } = await editAndLoseResponse(render, 'first', hub);
    act(() => {
      result.current.updateDraft(() => ({ body: 'first and more' }));
    });

    act(() => {
      hub.fire();
    });
    await waitUntil(() => result.current.saveState === 'saved', 'saved');

    expect(server.puts.map((p) => [p.version, p.bodyMarkdown])).toEqual([
      [1, 'first'],
      [1, 'first and more'],
      [2, 'first and more'],
    ]);
    expect(server.maxInFlight()).toBe(1);
    expect(server.stored()).toMatchObject({
      bodyMarkdown: 'first and more',
      version: 3,
    });
    expect(result.current.saveError).toBeNull();
    expect(result.current.dirty).toBe(false);
    expect(result.current.entity?.version).toBe(3);
  });

  test('edits typed after the lost save still conflict with a change from elsewhere', async () => {
    const hub = signalHub();
    const { result, server } = await editAndLoseResponse(render, 'first', hub);
    act(() => {
      result.current.updateDraft(() => ({ body: 'first and more' }));
    });
    server.editElsewhere({ bodyMarkdown: 'from another device' });

    act(() => {
      hub.fire();
    });
    await waitUntil(() => result.current.saveError === CONFLICT, 'conflict');

    expect(result.current.saveError).toBe(CONFLICT);
    expect(result.current.dirty).toBe(true);
    expect(server.puts).toHaveLength(2);
    expect(server.stored()).toMatchObject({
      bodyMarkdown: 'from another device',
      version: 3,
    });
  });
});
