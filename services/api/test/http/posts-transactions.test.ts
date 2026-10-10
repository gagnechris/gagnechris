import { describe, expect, it } from 'vitest';
import { keys, slugPk, slugPostSk } from '@gagnechris/data';
import type { Post } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('posts-tx');
const { call, ok, row } = siteAdminClient(h);

const makePost = (
  input: { title?: string; slug?: string; bodyMarkdown?: string } = {},
): Promise<Post> =>
  ok('POST', '/api/admin/posts', {
    body: {
      title: input.title ?? `Integration Post ${Date.now()}`,
      excerpt: '',
      bodyMarkdown: input.bodyMarkdown ?? 'Body',
      tags: [],
      projectIds: [],
      ...(input.slug ? { slug: input.slug } : {}),
    },
  });

const action = (post: Post, verb: string): Promise<Post> =>
  ok('POST', `/api/admin/posts/${post.id}/${verb}`, {
    body: { version: post.version },
  });

const update = (post: Post, body: Record<string, unknown>) =>
  call('PUT', `/api/admin/posts/${post.id}`, {
    body: { version: post.version, ...body },
  });

const updateOk = async (
  post: Post,
  body: Record<string, unknown>,
): Promise<Post> => {
  const res = await update(post, body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Post;
};

describe('posts transactions over HTTP (DynamoDB Local)', () => {
  it('lists summary rows with the flag stored on META', async () => {
    const draft = await makePost({ title: 'Listed', bodyMarkdown: 'live' });
    const published = await action(draft, 'publish');
    await updateOk(published, { bodyMarkdown: 'edited' });
    const meta = await row(keys.post.meta(draft.id));
    expect(meta?.hasUnpublishedChanges).toBe(true);

    const page = await ok('GET', '/api/admin/posts', {
      query: { status: 'published' },
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: draft.id,
        title: 'Listed',
        status: 'published',
        hasUnpublishedChanges: true,
      }),
    ]);
    expect(page.items[0]).not.toHaveProperty('bodyMarkdown');
  });

  it('publish, unpublish, and discard (PUBLISHED row)', async () => {
    const draft = await makePost({ title: 'Integration Post' });
    expect(draft.status).toBe('draft');

    const published = await action(draft, 'publish');
    expect(published.status).toBe('published');
    const publishedRow = await row(keys.post.published(draft.id));
    expect(publishedRow).toBeTruthy();
    expect(publishedRow?.status).toBe('published');

    const edited = await updateOk(published, { title: 'Edited title' });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await action(edited, 'discard');
    expect(discarded.title).toBe(published.title);
    const afterDiscard = await row(keys.post.published(draft.id));
    expect(afterDiscard?.title).toBe(published.title);

    const unpublished = await action(discarded, 'unpublish');
    expect(unpublished.status).toBe('draft');
    expect(await row(keys.post.published(draft.id))).toBeUndefined();
  });

  it('moves slug claims on rename (including published)', async () => {
    const post = await makePost({ title: 'Original Slug Post' });
    const published = await action(post, 'publish');
    const originalSlug = published.slug;

    const renamed = await updateOk(published, {
      slug: 'renamed-published-slug',
    });
    expect(renamed.slug).toBe('renamed-published-slug');

    const byNew = await row(keys.post.slugClaim('renamed-published-slug'));
    expect(byNew?.postId).toBe(post.id);
    const fetched = await ok('GET', `/api/admin/posts/${post.id}`);
    expect(fetched.slug).toBe('renamed-published-slug');

    expect(await row(keys.post.slugClaim(originalSlug))).toBeUndefined();
  });

  it('rejects slug collision without orphan claim', async () => {
    const first = await makePost({ title: 'First', slug: 'taken-slug' });
    const clash = await call('POST', '/api/admin/posts', {
      body: { title: 'Second', slug: 'taken-slug' },
    });
    expect(clash.status).toBe(409);

    const claim = await row({ pk: slugPk('taken-slug'), sk: slugPostSk() });
    expect(claim?.postId).toBe(first.id);

    const secondAttempt = await makePost({
      title: 'Other',
      slug: 'other-slug',
    });
    expect(secondAttempt.slug).toBe('other-slug');
  });

  it('returns HTTP 409 on conflict', async () => {
    await makePost({ title: 'Existing', slug: 'http-taken' });
    const result = await call('POST', '/api/admin/posts', {
      body: { title: 'Clash', slug: 'http-taken' },
    });
    expect(result.status).toBe(409);
  });

  it('rejects stale version updates', async () => {
    const post = await makePost({ title: 'Version Gate' });
    const res = await call('PUT', `/api/admin/posts/${post.id}`, {
      body: { version: post.version + 99, title: 'Nope' },
    });
    expect(res.status).toBe(409);
  });

  it('surfaces concurrent update conflicts', async () => {
    const post = await makePost({ title: 'Concurrent' });

    const results = await Promise.all([
      update(post, { title: 'Writer A' }),
      update(post, { title: 'Writer B' }),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('paginates draft list with exact counts and no duplicates', async () => {
    const created: Post[] = [];
    for (let i = 0; i < 3; i += 1) {
      created.push(await makePost({ title: `Paginate ${i} ${Date.now()}` }));
    }

    const first = await ok('GET', '/api/admin/posts', {
      query: { status: 'draft', limit: 2 },
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await ok('GET', '/api/admin/posts', {
      query: { status: 'draft', limit: 2, cursor: first.nextCursor },
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeFalsy();

    const ids = [
      ...first.items.map((p: Post) => p.id),
      ...second.items.map((p: Post) => p.id),
    ];
    expect(new Set(ids).size).toBe(3);
    expect(ids.sort()).toEqual(created.map((p) => p.id).sort());
  });
});
