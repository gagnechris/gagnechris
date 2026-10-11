import { describe, expect, it } from 'vitest';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import type { Post } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('posts');
const { call, ok, row } = siteAdminClient(h);

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

const create = (body: Record<string, unknown> = {}): Promise<Post> =>
  ok('POST', '/api/admin/posts', { body: { title: 'A post', ...body } });

const act = (post: Post, verb: string): Promise<Post> =>
  ok('POST', `/api/admin/posts/${post.id}/${verb}`, {
    body: { version: post.version },
  });

const edit = (post: Post, body: Record<string, unknown>): Promise<Post> =>
  ok('PUT', `/api/admin/posts/${post.id}`, {
    body: { version: post.version, ...body },
  });

async function rows(prefix: string) {
  const out = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
  return (out.Items ?? [])
    .filter((item) => String(item.pk).startsWith(prefix))
    .sort((a, b) =>
      `${a.pk}${a.sk}`.localeCompare(`${b.pk}${b.sk}`, 'en', {
        sensitivity: 'variant',
      }),
    );
}

const project = (id: string, status = 'draft') =>
  h.doc.send(
    new PutCommand({
      TableName: h.tableName,
      Item: {
        ...keys.project.meta(id),
        entityType: 'project',
        projectId: id,
        slug: id,
        name: id,
        pitch: '',
        stage: 'idea',
        stageNote: '',
        previewImage: null,
        bodyMarkdown: '',
        stack: [],
        links: [],
        demo: null,
        order: 1,
        href: null,
        status,
        publishedAt: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
      },
    }),
  );

describe('POST /api/admin/posts', () => {
  it('stores the draft and its slug claim', async () => {
    await project('p1');
    const post = await create({
      title: '  Crème Brûlée, Ünïcode & Ⅻ!  ',
      excerpt: 'Short',
      bodyMarkdown: '# Hi',
      tags: [' Go Lang ', 'go-lang', 'ΟΔΟΣ ΟΔΟΣ', '', 'İstanbul'],
      projectIds: ['p1', 'p1'],
      coverImage: '/media/2026/01/a.png',
      seo: { title: 'SEO', ogImage: '', extra: 'dropped' },
    });
    expect(post).toEqual({
      id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      slug: 'creme-brulee-unicode-xii',
      title: 'Crème Brûlée, Ünïcode & Ⅻ!',
      excerpt: 'Short',
      bodyMarkdown: '# Hi',
      tags: [
        'go-lang',
        'ΟΔΟΣ ΟΔΟΣ'.toLowerCase().replace(' ', '-'),
        'İstanbul'.toLowerCase(),
      ],
      projectIds: ['p1'],
      coverImage: '/media/2026/01/a.png',
      seo: { title: 'SEO', ogImage: '' },
      status: 'draft',
      publishedAt: null,
      updatedAt: expect.stringMatching(ISO),
      version: 1,
      hasUnpublishedChanges: false,
    });

    expect(await row(keys.post.meta(post.id))).toEqual({
      pk: `POST#${post.id}`,
      sk: 'META',
      entityType: 'post',
      postId: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: 'Short',
      bodyMarkdown: '# Hi',
      tags: post.tags,
      projectIds: ['p1'],
      status: 'draft',
      publishedAt: null,
      updatedAt: post.updatedAt,
      coverImage: '/media/2026/01/a.png',
      seo: { title: 'SEO', ogImage: '' },
      version: 1,
      hasUnpublishedChanges: false,
      gsi1pk: 'STATUS#draft',
      gsi1sk: `TS#${post.updatedAt}#POST#${post.id}`,
    });
    expect(await row(keys.post.slugClaim(post.slug))).toEqual({
      ...keys.post.slugClaim(post.slug),
      entityType: 'slug',
      postId: post.id,
    });
  });

  it('fills defaults and stores nulls', async () => {
    const post = await ok('POST', '/api/admin/posts', { body: {} });
    expect(post).toMatchObject({
      title: 'Untitled',
      slug: 'untitled',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
      projectIds: [],
      coverImage: null,
      seo: null,
    });
    expect(await row(keys.post.meta(post.id))).toMatchObject({
      coverImage: null,
      seo: null,
      tags: [],
      projectIds: [],
    });

    const blank = await create({ title: '   ', slug: ' Own Slug ' });
    expect(blank).toMatchObject({ title: 'Untitled', slug: 'own-slug' });
    const symbols = await call('POST', '/api/admin/posts', {
      body: { title: '!!!' },
    });
    expect(symbols.body).toEqual({
      error: 'slug_taken',
      message: 'Slug "untitled" is already taken',
    });
  });

  it.each([
    [
      'wrong types',
      {
        title: '',
        slug: '',
        excerpt: null,
        tags: null,
        projectIds: null,
        coverImage: 5,
        seo: { title: 1 },
      },
      {
        title: 'too_small',
        slug: 'too_small',
        excerpt: 'invalid_type',
        tags: 'invalid_type',
        projectIds: 'invalid_type',
        coverImage: 'invalid_type',
        'seo.title': 'invalid_type',
      },
    ],
    [
      'bad elements and sizes',
      {
        slug: 's'.repeat(121),
        tags: ['ok', 3],
        projectIds: Array.from({ length: 21 }, (_, i) => (i ? `p${i}` : '')),
        seo: 'x',
      },
      {
        slug: 'too_big',
        'tags.1': 'invalid_type',
        'projectIds.0': 'too_small',
        projectIds: 'too_big',
        seo: 'invalid_type',
      },
    ],
    ['an array', [], { _root: 'invalid_type' }],
  ])('rejects %s', async (_, body, fields) => {
    const res = await call('POST', '/api/admin/posts', { body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
    expect(await rows('POST#')).toEqual([]);
  });

  it('rejects unknown and deleted projects', async () => {
    await project('live');
    await project('gone', 'deleted');
    const res = await call('POST', '/api/admin/posts', {
      body: { title: 'x', projectIds: ['live', 'gone', 'nope', 'gone'] },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Unknown project id: gone, nope',
      fields: { projectIds: 'unknown_project' },
    });
  });

  it('answers 409 slug_taken and leaves the claim alone', async () => {
    const first = await create({ slug: 'taken' });
    const res = await call('POST', '/api/admin/posts', {
      body: { title: 'Again', slug: 'Taken' },
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'slug_taken',
      message: 'Slug "taken" is already taken',
    });
    expect((await row(keys.post.slugClaim('taken')))?.postId).toBe(first.id);
    expect(await rows('POST#')).toHaveLength(1);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await call('POST', '/api/admin/posts', { body: '{' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid JSON body',
    });
  });
});

describe('GET /api/admin/posts/:id', () => {
  it('reads the draft, flagged against PUBLISHED', async () => {
    const post = await act(await create(), 'publish');
    const edited = await edit(post, { excerpt: 'changed' });
    expect(await ok('GET', `/api/admin/posts/${post.id}`)).toEqual(edited);
    expect(edited.hasUnpublishedChanges).toBe(true);
  });

  it('answers 404 for a missing or deleted post', async () => {
    const res = await call('GET', '/api/admin/posts/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'not_found',
      message: 'Post nope not found',
    });

    const post = await create();
    await ok('DELETE', `/api/admin/posts/${post.id}`, {
      body: { version: post.version },
    });
    expect((await call('GET', `/api/admin/posts/${post.id}`)).status).toBe(404);
  });

  it('answers 500 data_integrity for a corrupt row', async () => {
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: { ...keys.post.meta('bad'), entityType: 'post', postId: 'bad' },
      }),
    );
    const res = await call('GET', '/api/admin/posts/bad');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'data_integrity',
      message: 'Stored data failed validation',
    });
  });
});

describe('PUT /api/admin/posts/:id', () => {
  it('changes only the fields sent', async () => {
    const post = await create({
      excerpt: 'keep',
      tags: ['a'],
      coverImage: '/c.png',
      seo: { title: 't' },
    });
    const edited = await edit(post, { title: 'New', tags: ['B', 'b'] });
    expect(edited).toEqual({
      ...post,
      title: 'New',
      tags: ['b'],
      updatedAt: expect.stringMatching(ISO),
      version: 2,
    });
    const cleared = await edit(edited, { coverImage: null, seo: null });
    expect(cleared).toMatchObject({ coverImage: null, seo: null, version: 3 });
  });

  it('renames: frees the old slug and leaves a redirect', async () => {
    const post = await create({ slug: 'old' });
    const renamed = await edit(post, { slug: 'New Name' });
    expect(renamed.slug).toBe('new-name');
    expect(await rows('SLUG#')).toEqual([
      {
        ...keys.post.slugClaim('new-name'),
        entityType: 'slug',
        postId: post.id,
      },
      {
        ...keys.post.slugRedirect('old'),
        entityType: 'slugRedirect',
        postId: post.id,
        targetSlug: 'new-name',
      },
    ]);
  });

  it('answers 409 slug_taken on a rename into another post', async () => {
    await create({ slug: 'mine' });
    const other = await create({ slug: 'other' });
    const res = await call('PUT', `/api/admin/posts/${other.id}`, {
      body: { version: other.version, slug: 'mine' },
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'slug_taken',
      message: 'Slug "mine" is already taken',
    });
    expect(
      (await ok('GET', `/api/admin/posts/${other.id}`)) as Post,
    ).toMatchObject({ slug: 'other', version: 1 });
  });

  it('answers 409 conflict with the current post for a stale version', async () => {
    const post = await create();
    const res = await call('PUT', `/api/admin/posts/${post.id}`, {
      body: { version: 7, title: 'Nope' },
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'conflict',
      message: 'Version conflict: expected 7, current 1',
      currentVersion: 1,
      current: post,
    });
  });

  it('checks only project ids the post does not have yet', async () => {
    await project('kept');
    const post = await create({ projectIds: ['kept'] });
    await project('kept', 'deleted');
    const same = await edit(post, { projectIds: ['kept'] });
    expect(same.projectIds).toEqual(['kept']);
    const res = await call('PUT', `/api/admin/posts/${post.id}`, {
      body: { version: same.version, projectIds: ['kept', 'new'] },
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Unknown project id: new');
  });

  it.each([
    [{}, { version: 'invalid_type' }],
    [
      { version: -1, title: null, slug: '', tags: 'x' },
      {
        version: 'too_small',
        title: 'invalid_type',
        slug: 'too_small',
        tags: 'invalid_type',
      },
    ],
    [{ version: 1.5 }, { version: 'invalid_type' }],
    [{ version: '1' }, { version: 'invalid_type' }],
  ])('rejects %j', async (body, fields) => {
    const res = await call('PUT', '/api/admin/posts/any', { body });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(fields);
  });

  it('answers 404 for a missing post', async () => {
    const res = await call('PUT', '/api/admin/posts/nope', {
      body: { version: 1, title: 'x' },
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Post nope not found');
  });
});

describe('publish, unpublish, discard and delete', () => {
  it('publish writes PUBLISHED, the tag index and the site publish row', async () => {
    const post = await create({ tags: ['one', 'two'], seo: { title: 's' } });
    const published = await act(post, 'publish');
    expect(published).toEqual({
      ...post,
      status: 'published',
      publishedAt: published.updatedAt,
      updatedAt: expect.stringMatching(ISO),
      version: 2,
      hasUnpublishedChanges: false,
    });
    expect(await row(keys.post.published(post.id))).toEqual({
      pk: `POST#${post.id}`,
      sk: 'PUBLISHED',
      entityType: 'post',
      postId: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: '',
      bodyMarkdown: '',
      tags: ['one', 'two'],
      projectIds: [],
      status: 'published',
      publishedAt: published.publishedAt,
      updatedAt: published.updatedAt,
      coverImage: null,
      seo: { title: 's' },
      version: 2,
    });
    expect(await row(keys.post.meta(post.id))).toMatchObject({
      gsi1pk: 'STATUS#published',
      gsi1sk: `TS#${published.publishedAt}#POST#${post.id}`,
      hasUnpublishedChanges: false,
    });
    const tagSk = `TS#${published.publishedAt}#POST#${post.id}`;
    expect(await rows('TAG#')).toEqual(
      ['one', 'two'].map((tag) => ({
        pk: `TAG#${tag}`,
        sk: tagSk,
        gsi2pk: `TAG#${tag}`,
        gsi2sk: tagSk,
        entityType: 'tagIndex',
        postId: post.id,
        slug: post.slug,
      })),
    );
    expect(await row(keys.sitePublish())).toEqual({
      ...keys.sitePublish(),
      entityType: 'sitePublish',
      generation: 1,
      postIds: new Set([post.id]),
    });
  });

  it('publishing unchanged content writes nothing', async () => {
    const published = await act(await create(), 'publish');
    const again = await act(published, 'publish');
    expect(again).toEqual(published);
    expect((await row(keys.sitePublish()))?.generation).toBe(1);
  });

  it('republish keeps publishedAt and moves only changed tags', async () => {
    const published = await act(
      await create({ tags: ['keep', 'drop'] }),
      'publish',
    );
    const edited = await edit(published, { tags: ['keep', 'add'] });
    expect(edited.hasUnpublishedChanges).toBe(true);
    expect((await rows('TAG#')).map((r) => r.pk)).toEqual([
      'TAG#drop',
      'TAG#keep',
    ]);
    const republished = await act(edited, 'publish');
    expect(republished.publishedAt).toBe(published.publishedAt);
    expect((await rows('TAG#')).map((r) => r.pk)).toEqual([
      'TAG#add',
      'TAG#keep',
    ]);
  });

  it('unpublish removes PUBLISHED and tags; republish keeps the first publishedAt', async () => {
    const published = await act(await create({ tags: ['t'] }), 'publish');
    const draft = await act(published, 'unpublish');
    expect(draft).toMatchObject({
      status: 'draft',
      publishedAt: published.publishedAt,
      version: 3,
    });
    expect(await row(keys.post.published(draft.id))).toBeUndefined();
    expect(await rows('TAG#')).toEqual([]);
    expect(await row(keys.post.meta(draft.id))).toMatchObject({
      gsi1pk: 'STATUS#draft',
      gsi1sk: `TS#${draft.updatedAt}#POST#${draft.id}`,
    });
    expect(await row(keys.sitePublish())).toEqual({
      ...keys.sitePublish(),
      entityType: 'sitePublish',
      generation: 2,
    });
    const again = await act(draft, 'unpublish');
    expect(again).toEqual(draft);
    expect((await act(draft, 'publish')).publishedAt).toBe(
      published.publishedAt,
    );
  });

  it('discard restores the PUBLISHED content', async () => {
    const published = await act(await create({ excerpt: 'live' }), 'publish');
    const edited = await edit(published, { excerpt: 'draft', slug: 'moved' });
    const discarded = await act(edited, 'discard');
    expect(discarded).toEqual({
      ...published,
      updatedAt: expect.stringMatching(ISO),
      version: edited.version + 1,
    });
    expect((await row(keys.post.slugClaim(published.slug)))?.postId).toBe(
      published.id,
    );
    expect(await row(keys.post.slugClaim('moved'))).toBeUndefined();
    expect(await act(discarded, 'discard')).toEqual(discarded);
    const draft = await create({ title: 'Never published' });
    expect(await act(draft, 'discard')).toEqual(draft);
  });

  it('delete leaves a tombstone and frees the slug', async () => {
    const published = await act(
      await create({ slug: 'gone', tags: ['t'] }),
      'publish',
    );
    const deleted: Post = await ok(
      'DELETE',
      `/api/admin/posts/${published.id}`,
      { body: { version: published.version } },
    );
    expect(deleted).toMatchObject({
      status: 'deleted',
      version: 3,
      hasUnpublishedChanges: false,
    });
    expect(await row(keys.post.meta(published.id))).toMatchObject({
      status: 'deleted',
      gsi1pk: 'STATUS#deleted',
    });
    expect(await row(keys.post.published(published.id))).toBeUndefined();
    expect(await row(keys.post.slugClaim('gone'))).toBeUndefined();
    expect(await rows('TAG#')).toEqual([]);
    expect((await row(keys.sitePublish()))?.postIds).toBeUndefined();
    expect((await create({ slug: 'gone' })).slug).toBe('gone');
  });

  it('answers 409 conflict with the current post for a stale version', async () => {
    const post = await create();
    for (const verb of ['publish', 'unpublish', 'discard']) {
      const res = await call('POST', `/api/admin/posts/${post.id}/${verb}`, {
        body: { version: 0 },
      });
      expect(res.status, verb).toBe(409);
      expect(res.body).toEqual({
        error: 'conflict',
        message: 'Version conflict: expected 0, current 1',
        currentVersion: 1,
        current: post,
      });
    }
  });

  it('answers 400 without a version and 404 for a missing post', async () => {
    const res = await call('DELETE', '/api/admin/posts/nope');
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ version: 'invalid_type' });
    const missing = await call('POST', '/api/admin/posts/nope/publish', {
      body: { version: 1 },
    });
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Post nope not found');
  });
});

describe('GET /api/admin/posts', () => {
  it('lists summaries, published first, with counts on the first page', async () => {
    const a = await create({ title: 'A', excerpt: 'hidden' });
    const b = await act(await create({ title: 'B' }), 'publish');
    const page = await ok('GET', '/api/admin/posts');
    expect(page).toEqual({
      items: [
        {
          id: b.id,
          slug: b.slug,
          title: 'B',
          tags: [],
          projectIds: [],
          status: 'published',
          publishedAt: b.publishedAt,
          updatedAt: b.updatedAt,
          version: b.version,
          hasUnpublishedChanges: false,
        },
        expect.objectContaining({ id: a.id, status: 'draft' }),
      ],
      counts: { all: 2, published: 1, draft: 1 },
    });
    const first = await ok('GET', '/api/admin/posts', { query: { limit: 1 } });
    expect(first.items).toHaveLength(1);
    const next = await ok('GET', '/api/admin/posts', {
      query: { limit: 1, cursor: first.nextCursor },
    });
    expect(next.items).toEqual([expect.objectContaining({ id: a.id })]);
    expect(next).not.toHaveProperty('counts');
  });

  it('computes the flag for rows stored without one and skips corrupt rows', async () => {
    const published = await act(await create(), 'publish');
    await edit(published, { title: 'Changed' });
    const meta = await row(keys.post.meta(published.id));
    delete meta!.hasUnpublishedChanges;
    await h.doc.send(new PutCommand({ TableName: h.tableName, Item: meta }));
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: {
          ...keys.post.meta('corrupt'),
          entityType: 'post',
          gsi1pk: 'STATUS#published',
          gsi1sk: 'TS#9999#POST#corrupt',
        },
      }),
    );
    const page = await ok('GET', '/api/admin/posts', {
      query: { status: 'published' },
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        id: published.id,
        hasUnpublishedChanges: true,
      }),
    ]);
  });

  it('searches title, slug and tags case-insensitively', async () => {
    await create({ title: 'Go Generics' });
    await create({ title: 'Other', slug: 'about-go' });
    await create({ title: 'Third', tags: ['GoLang'] });
    await create({ title: 'Unrelated' });
    const page = await ok('GET', '/api/admin/posts', {
      query: { q: '  GO ' },
    });
    expect(page.items.map((p: Post) => p.title).sort()).toEqual([
      'Go Generics',
      'Other',
      'Third',
    ]);
    expect(page.counts).toEqual({ all: 4, published: 0, draft: 4 });
  });

  it.each([
    [
      { status: 'nope', q: 'q'.repeat(201), cursor: '', limit: '0' },
      {
        status: 'invalid_value',
        q: 'too_big',
        cursor: 'too_small',
        limit: 'too_small',
      },
    ],
    [{ limit: 'abc' }, { limit: 'invalid_type' }],
    [{ limit: '1.5' }, { limit: 'invalid_type' }],
    [{ limit: '1e3' }, { limit: 'too_big' }],
    [{ limit: 'Infinity' }, { limit: 'invalid_type' }],
  ])('rejects query %j', async (query, fields) => {
    const res = await call('GET', '/api/admin/posts', { query });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid query parameters',
      fields,
    });
  });

  it('accepts limits Number() reads', async () => {
    for (const limit of [' 5 ', '0x10', '1e1']) {
      const res = await call('GET', '/api/admin/posts', { query: { limit } });
      expect(res.status, limit).toBe(200);
    }
  });

  it('rejects a malformed cursor or one from another status', async () => {
    for (let i = 0; i < 3; i += 1) await create({ title: `P${i}` });
    const drafts = await ok('GET', '/api/admin/posts', {
      query: { status: 'draft', limit: 1 },
    });
    for (const [query, label] of [
      [{ cursor: 'garbage' }, 'garbage'],
      [{ status: 'published', cursor: drafts.nextCursor }, 'other status'],
    ] as const) {
      const res = await call('GET', '/api/admin/posts', { query });
      expect(res.status, label).toBe(400);
      expect(res.body).toEqual({
        error: 'bad_request',
        message: 'Invalid pagination cursor',
      });
    }
  });
});
