import { beforeAll, describe, expect, it } from 'vitest';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';
import { create, inBatches, testUlid } from './support/paging-corpus.js';

const USER = 'user-page-size';
const N = 100;
const BIG = 99_000;
const MAX_PAGE_BYTES = 1_500_000;

function bigText(i: number): string {
  return `${i} `.padEnd(BIG, 'x');
}

const h = useApi('page-size', { truncate: false });

describe('list and sync page size (DynamoDB Local)', () => {
  const noteIds: string[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    for (let i = 0; i < N; i += 1) {
      noteIds.push(testUlid('N', i));
      taskIds.push(testUlid('T', i));
    }
    await inBatches(N, async (i) => {
      await create(h, USER, '/api/notebook/notes', {
        id: noteIds[i],
        area: i % 2 === 0 ? 'work' : 'personal',
        type: 'page',
        title: `note ${i}`,
        bodyMarkdown: bigText(i),
        tags: [],
        pinned: false,
      });
      await create(h, USER, '/api/notebook/tasks', {
        id: taskIds[i],
        area: i % 2 === 0 ? 'work' : 'personal',
        title: `task ${i}`,
        description: bigText(i),
        priority: 'med',
        status: (['todo', 'in_progress', 'done'] as const)[i % 3]!,
        dueDate: null,
        tags: [],
      });
    });
  }, 300_000);

  /** Follows `nextCursor` to the end, checking every response's size. */
  async function walk(
    path: string,
    query: Record<string, string>,
    itemsKey: 'items' | 'changes',
  ): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let pages = 1; pages <= 200; pages += 1) {
      const res = await h.api.request<Record<string, unknown>>('GET', path, {
        claims: notebookUser(USER),
        query: { ...query, ...(cursor ? { cursor } : {}) },
      });
      expect(res.status).toBe(200);
      // The harness hands back parsed JSON; its compact form is the body
      // Lambda would carry, and Content-Length (when sent) is the wire size.
      const raw = JSON.stringify(res.body);
      expect(Buffer.byteLength(raw, 'utf8')).toBeLessThanOrEqual(
        MAX_PAGE_BYTES,
      );
      const wire = res.headers.get('content-length');
      if (wire != null) {
        expect(Number(wire)).toBeLessThanOrEqual(MAX_PAGE_BYTES);
      }
      // What Lambda measures: the proxy result with the body escaped again.
      const proxyResult = {
        statusCode: res.status,
        headers: Object.fromEntries(res.headers),
        body: raw,
      };
      expect(
        Buffer.byteLength(JSON.stringify(proxyResult), 'utf8'),
      ).toBeLessThanOrEqual(MAX_PAGE_BYTES);
      const items = res.body[itemsKey] as Array<{ id: string }>;
      ids.push(...items.map((item) => item.id));
      cursor = res.body.nextCursor as string | undefined;
      if (!cursor) return { ids, pages };
    }
    throw new Error(`${path} paging did not terminate`);
  }

  function expectExactly(got: string[], expected: string[]) {
    expect(new Set(got).size).toBe(got.length);
    expect([...got].sort()).toEqual([...expected].sort());
  }

  it('notes list pages stay under the size cap and return every note', async () => {
    const all = await walk('/api/notebook/notes', { limit: '100' }, 'items');
    expectExactly(all.ids, noteIds);
    expect(all.pages).toBeGreaterThan(1);
    for (const area of ['work', 'personal']) {
      const one = await walk(
        '/api/notebook/notes',
        { limit: '100', area },
        'items',
      );
      expectExactly(
        one.ids,
        noteIds.filter((_, i) => (i % 2 === 0) === (area === 'work')),
      );
    }
  }, 120_000);

  it('tasks list pages stay under the size cap and return every task', async () => {
    const all = await walk('/api/notebook/tasks', { limit: '100' }, 'items');
    expectExactly(all.ids, taskIds);
    expect(all.pages).toBeGreaterThan(1);
  }, 120_000);

  it('sync pages stay under the size cap and return every change', async () => {
    const all = await walk(
      '/api/notebook/sync/changes',
      { limit: '100' },
      'changes',
    );
    expectExactly(all.ids, [...noteIds, ...taskIds]);
    expect(all.pages).toBeGreaterThan(1);
  }, 120_000);
});
