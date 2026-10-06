import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostsRepository } from '../../src/posts/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
} from '../support/dynamo-local.js';

describe('posts list search and counts (DynamoDB Local)', () => {
  let tableName: string;
  let repo: PostsRepository;
  const doc = createLocalDocClient();
  const needles = new Set<string>();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('posts-search');
    repo = new PostsRepository(doc, tableName);
    for (let i = 0; i < 30; i += 1) {
      const created = await repo.create({
        title: i % 4 === 1 ? `Needle ${i}` : `Post ${i}`,
        slug: `post-${i}`,
        excerpt: '',
        bodyMarkdown: '',
        tags: [],
        projectIds: [],
      });
      if (i % 4 === 1) needles.add(created.id);
      if (i % 3 === 0) await repo.publish(created.id, created.version);
    }
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  async function walk(q: string, limit: number) {
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await repo.list(undefined, { q, limit, cursor });
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor && pages.length < 50);
    return pages;
  }

  it('counts both partitions', async () => {
    expect(await repo.counts()).toEqual({ all: 30, published: 10, draft: 20 });
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
