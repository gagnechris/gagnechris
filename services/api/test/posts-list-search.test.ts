import { beforeEach, describe, expect, it } from 'vitest';
import { PostsRepository } from '../src/posts/repository.js';
import { createPostRoutes } from '../src/posts/handlers.js';
import { dispatchRoutes } from '../src/router.js';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';

const TABLE = 'gagnechris-test';

describe('admin posts list: server-side search and counts', () => {
  let repo: PostsRepository;
  const needles = new Set<string>();

  beforeEach(async () => {
    const memory = createMemoryDoc();
    repo = new PostsRepository(memory.doc, TABLE);
    needles.clear();
    for (let i = 0; i < 24; i += 1) {
      const needle = i % 7 === 3;
      const created = await repo.create({
        title: needle && i % 2 ? `Needle ${i}` : `Post ${i}`,
        slug: `post-${i}`,
        excerpt: '',
        bodyMarkdown: '',
        tags: needle && !(i % 2) ? ['NEEDLE'] : ['other'],
        projectIds: [],
      });
      if (needle) needles.add(created.id);
      if (i % 2) await repo.publish(created.id, created.version);
    }
  });

  async function get(query: Record<string, string>) {
    const result = await dispatchRoutes(
      createPostRoutes(repo),
      makeEvent('GET', '/api/admin/posts', {
        jwtClaims: { sub: 'admin-1' },
        query,
      }),
      'GET',
      '/api/admin/posts',
    );
    expect(result.statusCode).toBe(200);
    return JSON.parse(result.body as string) as {
      items: Array<{ id: string; title: string; status: string }>;
      nextCursor?: string;
      counts?: { all: number; draft: number; published: number };
    };
  }

  async function walk(query: Record<string, string>) {
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await get({ ...query, ...(cursor ? { cursor } : {}) });
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor && pages.length < 50);
    return pages;
  }

  it('counts every post, not just the first page', async () => {
    const page = await get({ limit: '5' });
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeDefined();
    expect(page.counts).toEqual({ all: 24, draft: 12, published: 12 });
  });

  it('finds matches across every page, a page at a time', async () => {
    const pages = await walk({ q: 'needle', limit: '2' });
    const ids = pages.flatMap((p) => p.items.map((i) => i.id));
    expect(new Set(ids)).toEqual(needles);
    expect(ids).toHaveLength(needles.size);
    for (const page of pages) expect(page.items.length).toBeLessThanOrEqual(2);
    expect(pages[0]!.items).toHaveLength(2);
  });

  it('a broad query still pages at the limit without skipping or repeating rows', async () => {
    const pages = await walk({ q: 'post-', limit: '5' });
    const ids = pages.flatMap((p) => p.items.map((i) => i.id));
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    for (const page of pages) expect(page.items.length).toBeLessThanOrEqual(5);
  });

  it('filters by status on the server, combined with q', async () => {
    const pages = await walk({ q: 'needle', status: 'published' });
    const items = pages.flatMap((p) => p.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.status === 'published')).toBe(true);
    expect(items.every((i) => needles.has(i.id))).toBe(true);
  });

  it('returns nothing for a query no post matches', async () => {
    const pages = await walk({ q: 'zzz' });
    expect(pages.flatMap((p) => p.items)).toEqual([]);
  });
});
