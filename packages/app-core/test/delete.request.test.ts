import { createApiClient } from '@gagnechris/api-client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { deleteNote, deletePost, deleteTask } from '../src/query/api.js';

type Captured = { method: string; url: string; body: unknown };

/** Real openapi-fetch client over a stub fetch, so the wire shape is tested. */
const clientCapturing = (captured: Captured[]) => {
  vi.stubGlobal('fetch', async (input: Request) => {
    const text = await input.text();
    captured.push({
      method: input.method,
      url: input.url,
      body: text ? JSON.parse(text) : undefined,
    });
    return new Response(JSON.stringify({ id: 'x', version: 4 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return createApiClient({ baseUrl: 'http://api.test' });
};

describe('delete requests send the expected version', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    ['page', deleteNote, '/api/notebook/notes/01ARZ3NDEKTSV4RRFFQ48JMCZC'],
    ['task', deleteTask, '/api/notebook/tasks/01ARZ3NDEKTSV4RRFFQ48JMCZC'],
    ['post', deletePost, '/api/admin/posts/01ARZ3NDEKTSV4RRFFQ48JMCZC'],
  ] as const)('%s', async (_label, del, path) => {
    const captured: Captured[] = [];
    const client = clientCapturing(captured);
    await del(client, '01ARZ3NDEKTSV4RRFFQ48JMCZC', { version: 3 });
    expect(captured).toEqual([
      { method: 'DELETE', url: `http://api.test${path}`, body: { version: 3 } },
    ]);
  });
});
