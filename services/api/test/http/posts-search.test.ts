import { beforeAll, describe, expect, it } from 'vitest';
import type { PostSummary } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('posts-search', { truncate: false });
const { ok } = siteAdminClient(h);

type Page = { items: PostSummary[]; nextCursor?: string };

describe('posts list search and counts over HTTP (DynamoDB Local)', () => {
  const needles = new Set<string>();

  beforeAll(async () => {
    for (let i = 0; i < 30; i += 1) {
      const created = await ok('POST', '/api/admin/posts', {
        body: {
          title: i % 4 === 1 ? `Needle ${i}` : `Post ${i}`,
          slug: `post-${i}`,
          excerpt: '',
          bodyMarkdown: '',
          tags: [],
          projectIds: [],
        },
      });
      if (i % 4 === 1) needles.add(created.id);
      if (i % 3 === 0) {
        await ok('POST', `/api/admin/posts/${created.id}/publish`, {
          body: { version: created.version },
        });
      }
    }
  });

  async function walk(q: string, limit: number): Promise<Page[]> {
    const pages: Page[] = [];
    let cursor: string | undefined;
    do {
      const page: Page = await ok('GET', '/api/admin/posts', {
        query: { q, limit, ...(cursor ? { cursor } : {}) },
      });
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor && pages.length < 50);
    return pages;
  }

  it('counts both partitions', async () => {
    const page = await ok('GET', '/api/admin/posts');
    expect(page.counts).toEqual({ all: 30, published: 10, draft: 20 });
  });

  it('pages through every match, newest first within each status', async () => {
    const pages = await walk('NEEDLE', 3);
    const items = pages.flatMap((p) => p.items);
    expect(new Set(items.map((i) => i.id))).toEqual(needles);
    expect(items).toHaveLength(needles.size);
    for (const page of pages) expect(page.items.length).toBeLessThanOrEqual(3);
    const statuses = items.map((i) => i.status);
    expect(statuses).toEqual([...statuses].sort().reverse());
  });

  it('a query matching every row pages at the limit with no gaps', async () => {
    const items = (await walk('post-', 7)).flatMap((p) => p.items);
    expect(new Set(items.map((i) => i.id)).size).toBe(30);
    expect(items).toHaveLength(30);
  });
});
