import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { keys, slugPk, slugPostSk } from '@gagnechris/data';
import { ConflictError } from '../../src/data/errors.js';
import { createPostRoutes } from '../../src/posts/handlers.js';
import { dispatchRoutes } from '../../src/router.js';
import { makeCtx, makePost } from '../support/builders.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

describe('posts transactions (DynamoDB Local)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('posts-tx');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  it('publish, unpublish, and discard (PUBLISHED row)', async () => {
    const ctx = makeCtx(doc, tableName);
    const draft = await makePost(ctx, { title: 'Integration Post' });
    expect(draft.status).toBe('draft');

    const published = await ctx.posts.publish(draft.id, draft.version);
    expect(published.status).toBe('published');
    const publishedRow = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.post.published(draft.id),
      }),
    );
    expect(publishedRow.Item).toBeTruthy();
    expect(publishedRow.Item?.status).toBe('published');

    const edited = await ctx.posts.update(published.id, {
      version: published.version,
      title: 'Edited title',
    });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await ctx.posts.discard(edited.id, edited.version);
    expect(discarded.title).toBe(published.title);
    const afterDiscard = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.post.published(draft.id),
      }),
    );
    expect(afterDiscard.Item?.title).toBe(published.title);

    const unpublished = await ctx.posts.unpublish(
      discarded.id,
      discarded.version,
    );
    expect(unpublished.status).toBe('draft');
    const afterUnpublish = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.post.published(draft.id),
      }),
    );
    expect(afterUnpublish.Item).toBeUndefined();
  });

  it('moves slug claims on rename (including published)', async () => {
    const ctx = makeCtx(doc, tableName);
    const post = await makePost(ctx, { title: 'Original Slug Post' });
    const published = await ctx.posts.publish(post.id, post.version);
    const originalSlug = published.slug;

    const renamed = await ctx.posts.update(published.id, {
      version: published.version,
      slug: 'renamed-published-slug',
    });
    expect(renamed.slug).toBe('renamed-published-slug');

    const byNew = await ctx.posts.getBySlug('renamed-published-slug');
    expect(byNew?.id).toBe(post.id);

    const byOld = await ctx.posts.getBySlug(originalSlug);
    expect(byOld).toBeUndefined();
  });

  it('rejects slug collision without orphan claim', async () => {
    const ctx = makeCtx(doc, tableName);
    const first = await makePost(ctx, {
      title: 'First',
      slug: 'taken-slug',
    });
    await expect(
      makePost(ctx, { title: 'Second', slug: 'taken-slug' }),
    ).rejects.toBeInstanceOf(ConflictError);

    const claim = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: slugPk('taken-slug'), sk: slugPostSk() },
      }),
    );
    expect(claim.Item?.postId).toBe(first.id);

    const secondAttempt = await makePost(ctx, {
      title: 'Other',
      slug: 'other-slug',
    });
    expect(secondAttempt.slug).toBe('other-slug');
  });

  it('returns HTTP 409 on conflict', async () => {
    const ctx = makeCtx(doc, tableName);
    await makePost(ctx, { title: 'Existing', slug: 'http-taken' });
    const result = await dispatchRoutes(
      createPostRoutes(ctx.posts),
      makeEvent('POST', '/api/admin/posts', {
        jwtClaims: { sub: 'admin-1' },
        body: { title: 'Clash', slug: 'http-taken' },
      }),
      'POST',
      '/api/admin/posts',
    );
    expect(result.statusCode).toBe(409);
  });

  it('rejects stale version updates', async () => {
    const ctx = makeCtx(doc, tableName);
    const post = await makePost(ctx, { title: 'Version Gate' });
    await expect(
      ctx.posts.update(post.id, {
        version: post.version + 99,
        title: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('surfaces concurrent update conflicts', async () => {
    const ctx = makeCtx(doc, tableName);
    const post = await makePost(ctx, { title: 'Concurrent' });

    const results = await Promise.allSettled([
      ctx.posts.update(post.id, { version: post.version, title: 'Writer A' }),
      ctx.posts.update(post.id, { version: post.version, title: 'Writer B' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
  });

  it('paginates draft list with exact counts and no duplicates', async () => {
    const ctx = makeCtx(doc, tableName);
    const created = [];
    for (let i = 0; i < 3; i += 1) {
      created.push(
        await makePost(ctx, {
          title: `Paginate ${i} ${Date.now()}`,
        }),
      );
    }

    const first = await ctx.posts.list('draft', { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await ctx.posts.list('draft', {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeFalsy();

    const ids = [
      ...first.items.map((p) => p.id),
      ...second.items.map((p) => p.id),
    ];
    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual(created.map((p) => p.id).sort());
  });

  it('refuses to operate on non gagnechris-it- tables', async () => {
    await expect(truncateTable(doc, 'gagnechris-local')).rejects.toThrow(
      /gagnechris-it-/,
    );
  });
});
