import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/data/errors.js';
import { PostsRepository } from '../../src/posts/repository.js';
import {
  createLocalDocClient,
  integrationTableName,
  truncateTable,
} from '../support/dynamo-local.js';

describe('posts transactions (DynamoDB Local)', () => {
  const tableName = integrationTableName();
  const doc = createLocalDocClient();

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  it('publish, unpublish, and discard', async () => {
    const repo = new PostsRepository(doc, tableName);
    const draft = await repo.create({
      title: 'Integration Post',
      excerpt: '',
      bodyMarkdown: 'Body',
      tags: [],
    });
    expect(draft.status).toBe('draft');

    const published = await repo.publish(draft.id);
    expect(published.status).toBe('published');

    const edited = await repo.update(published.id, {
      version: published.version,
      title: 'Edited title',
    });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await repo.discard(edited.id, edited.version);
    expect(discarded.title).toBe(published.title);

    const unpublished = await repo.unpublish(discarded.id, discarded.version);
    expect(unpublished.status).toBe('draft');
  });

  it('moves slug claims on rename', async () => {
    const repo = new PostsRepository(doc, tableName);
    const post = await repo.create({
      title: 'Original Slug Post',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
    });
    const originalSlug = post.slug;

    const renamed = await repo.update(post.id, {
      version: post.version,
      slug: 'renamed-slug-post',
    });
    expect(renamed.slug).toBe('renamed-slug-post');

    const byNew = await repo.getBySlug('renamed-slug-post');
    expect(byNew?.id).toBe(post.id);

    const byOld = await repo.getBySlug(originalSlug);
    expect(byOld).toBeUndefined();
  });

  it('rejects stale version updates', async () => {
    const repo = new PostsRepository(doc, tableName);
    const post = await repo.create({
      title: 'Version Gate',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
    });
    await expect(
      repo.update(post.id, { version: post.version + 99, title: 'Nope' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('surfaces concurrent update conflicts', async () => {
    const repo = new PostsRepository(doc, tableName);
    const post = await repo.create({
      title: 'Concurrent',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
    });

    const results = await Promise.allSettled([
      repo.update(post.id, { version: post.version, title: 'Writer A' }),
      repo.update(post.id, { version: post.version, title: 'Writer B' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
  });

  it('paginates draft list via cursor', async () => {
    const repo = new PostsRepository(doc, tableName);
    for (let i = 0; i < 3; i += 1) {
      await repo.create({
        title: `Paginate ${i} ${Date.now()}`,
        excerpt: '',
        bodyMarkdown: '',
        tags: [],
      });
    }

    const first = await repo.list('draft', { limit: 2 });
    expect(first.items.length).toBe(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await repo.list('draft', {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.length).toBeGreaterThanOrEqual(1);
    const ids = new Set([
      ...first.items.map((p) => p.id),
      ...second.items.map((p) => p.id),
    ]);
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});
