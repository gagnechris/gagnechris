import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keys, slugPk, slugPostSk } from '@gagnechris/data';
import { CreateProjectRequestSchema, type Project } from '@gagnechris/shared';
import { createProjectRoutes } from '../src/projects/handlers.js';
import { ProjectsRepository } from '../src/projects/repository.js';
import { dispatchRoutes } from '../src/router.js';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';

const TABLE = 'gagnechris-test';
const ADMIN = { sub: 'admin-1' };

describe('projects admin API', () => {
  let store: ReturnType<typeof createMemoryDoc>['store'];
  let routes: ReturnType<typeof createProjectRoutes>;

  beforeEach(() => {
    const memory = createMemoryDoc();
    store = memory.store;
    routes = createProjectRoutes(new ProjectsRepository(memory.doc, TABLE));
  });

  const row = (key: { pk: string; sk: string }) =>
    store.get(`${key.pk}\0${key.sk}`);

  async function call(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ) {
    const result = await dispatchRoutes(
      routes,
      makeEvent(method, path, { jwtClaims: ADMIN, body, query }),
      method,
      path,
    );
    return {
      status: result.statusCode,
      body: JSON.parse(result.body as string) as Project &
        Record<string, unknown>,
    };
  }

  async function create(body: Record<string, unknown>) {
    const res = await call('POST', '/api/admin/projects', body);
    expect(res.status).toBe(201);
    return res.body;
  }

  it('creates a draft project with its slug claim', async () => {
    const project = await create({
      name: 'Notebook',
      stage: 'building',
      stack: ['TypeScript', ' TypeScript ', 'DynamoDB'],
    });
    expect(project).toMatchObject({
      slug: 'notebook',
      stage: 'building',
      status: 'draft',
      version: 1,
      href: null,
      demo: null,
      previewImage: null,
      stack: ['TypeScript', 'DynamoDB'],
    });
    expect(row(keys.project.slugClaim('notebook'))).toMatchObject({
      entityType: 'projectSlug',
      projectId: project.id,
    });
    expect(row(keys.project.meta(project.id))).toMatchObject({
      entityType: 'project',
      gsi1pk: 'PROJECT_STATUS#draft',
    });
  });

  it('rejects a second project with the same slug', async () => {
    await create({ name: 'Notebook' });
    const res = await call('POST', '/api/admin/projects', { name: 'notebook' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('slug_taken');
  });

  it('keeps project slugs apart from post slugs', async () => {
    store.set(`${slugPk('posts')}\0${slugPostSk()}`, {
      pk: slugPk('posts'),
      sk: slugPostSk(),
      entityType: 'slug',
      postId: 'post-1',
    });
    const project = await create({ name: 'Posts' });
    expect(project.slug).toBe('posts');
  });

  it('publishes an idea with no body or preview image', async () => {
    const idea = await create({ name: 'Someday', stage: 'idea' });
    const res = await call('POST', `/api/admin/projects/${idea.id}/publish`, {
      version: idea.version,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'published',
      bodyMarkdown: '',
      previewImage: null,
    });
    expect(row(keys.project.published(idea.id))).toMatchObject({
      status: 'published',
      sk: 'PUBLISHED',
    });
    expect(row(keys.project.published(idea.id))).not.toHaveProperty('gsi1pk');
  });

  it('keeps draft edits off the live snapshot until republished', async () => {
    const draft = await create({ name: 'Posts', stage: 'live' });
    const published = (
      await call('POST', `/api/admin/projects/${draft.id}/publish`, {
        version: draft.version,
      })
    ).body;
    const edited = await call('PUT', `/api/admin/projects/${draft.id}`, {
      version: published.version,
      pitch: 'A CMS',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.hasUnpublishedChanges).toBe(true);
    expect(row(keys.project.published(draft.id))?.pitch).toBe('');
  });

  it('unpublish deletes the PUBLISHED snapshot', async () => {
    const draft = await create({ name: 'Posts' });
    const published = (
      await call('POST', `/api/admin/projects/${draft.id}/publish`, {
        version: draft.version,
      })
    ).body;
    const res = await call(
      'POST',
      `/api/admin/projects/${draft.id}/unpublish`,
      { version: published.version },
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
    expect(row(keys.project.published(draft.id))).toBeUndefined();
  });

  it('soft delete drops the live snapshot and frees the slug', async () => {
    const draft = await create({ name: 'Posts' });
    const published = (
      await call('POST', `/api/admin/projects/${draft.id}/publish`, {
        version: draft.version,
      })
    ).body;
    const res = await call('DELETE', `/api/admin/projects/${draft.id}`, {
      version: published.version,
    });
    expect(res.status).toBe(200);
    expect(row(keys.project.published(draft.id))).toBeUndefined();
    expect(row(keys.project.slugClaim('posts'))).toBeUndefined();
    expect((await call('GET', `/api/admin/projects/${draft.id}`)).status).toBe(
      404,
    );
    await create({ name: 'Posts' });
  });

  it('renaming moves the slug claim and keeps a redirect row', async () => {
    const draft = await create({ name: 'Notebook' });
    const res = await call('PUT', `/api/admin/projects/${draft.id}`, {
      version: draft.version,
      slug: 'my-notebook',
    });
    expect(res.status).toBe(200);
    expect(row(keys.project.slugClaim('notebook'))).toBeUndefined();
    expect(row(keys.project.slugClaim('my-notebook'))?.projectId).toBe(
      draft.id,
    );
    expect(row(keys.project.slugRedirect('notebook'))).toMatchObject({
      targetSlug: 'my-notebook',
      projectId: draft.id,
    });
  });

  it('a stale version is a 409 with the current project', async () => {
    const draft = await create({ name: 'Posts' });
    await call('PUT', `/api/admin/projects/${draft.id}`, {
      version: draft.version,
      pitch: 'one',
    });
    const res = await call('PUT', `/api/admin/projects/${draft.id}`, {
      version: draft.version,
      pitch: 'two',
    });
    expect(res.status).toBe(409);
    expect(res.body.currentVersion).toBe(2);
  });

  it('lists published projects first, each group by order', async () => {
    const b = await create({ name: 'B', order: 2 });
    const a = await create({ name: 'A', order: 1 });
    await create({ name: 'C', order: 0 });
    for (const p of [a, b]) {
      await call('POST', `/api/admin/projects/${p.id}/publish`, {
        version: p.version,
      });
    }
    const all = await call('GET', '/api/admin/projects');
    expect(
      (all.body as unknown as { items: Project[] }).items.map((p) => p.name),
    ).toEqual(['A', 'B', 'C']);
    const drafts = await call('GET', '/api/admin/projects', undefined, {
      status: 'draft',
    });
    expect(
      (drafts.body as unknown as { items: Project[] }).items.map((p) => p.name),
    ).toEqual(['C']);
  });

  describe('href', () => {
    it.each([
      '/dont-feed-the-bears',
      'https://github.com/gagnechris/gagnechris.com',
    ])('accepts %s', async (href) => {
      expect((await create({ name: `x ${href}`, href })).href).toBe(href);
    });

    it.each([
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,hi',
      '//evil.example',
      'http://example.com',
      'dont-feed-the-bears',
      '/a b',
      '/a\\b',
      'https://user@evil.example',
    ])('rejects %s', async (href) => {
      const res = await call('POST', '/api/admin/projects', {
        name: 'Bears',
        href,
      });
      expect(res.status).toBe(400);
    });

    it('can be cleared', async () => {
      const p = await create({ name: 'Bears', href: '/dont-feed-the-bears' });
      const res = await call('PUT', `/api/admin/projects/${p.id}`, {
        version: p.version,
        href: null,
      });
      expect(res.body.href).toBeNull();
    });
  });

  it('validates links the way post bodies do', async () => {
    const ok = await create({
      name: 'Links',
      links: [
        { label: 'Source', url: 'https://github.com/gagnechris' },
        { label: 'Mail', url: 'mailto:me@example.com' },
        { label: 'Posts', url: '/posts' },
      ],
    });
    expect(ok.links).toHaveLength(3);
    const bad = await call('POST', '/api/admin/projects', {
      name: 'Bad',
      links: [{ label: 'x', url: 'javascript:alert(1)' }],
    });
    expect(bad.status).toBe(400);
  });

  it('accepts only /media paths for the preview image', async () => {
    expect(
      (await create({ name: 'Img', previewImage: '/media/a/b.png' }))
        .previewImage,
    ).toBe('/media/a/b.png');
    for (const previewImage of [
      'https://evil.example/x.png',
      '/media/../secret',
      '/other/x.png',
    ]) {
      const res = await call('POST', '/api/admin/projects', {
        name: 'Img2',
        previewImage,
      });
      expect(res.status, previewImage).toBe(400);
    }
  });

  it('rejects an unknown demo id', async () => {
    const res = await call('POST', '/api/admin/projects', {
      name: 'Demo',
      demo: 'bears',
    });
    expect(res.status).toBe(400);
    expect((await create({ name: 'Demo', demo: 'notebook' })).demo).toBe(
      'notebook',
    );
  });

  describe('publishing with a demo', () => {
    const publish = (p: Project) =>
      call('POST', `/api/admin/projects/${p.id}/publish`, {
        version: p.version,
      });

    it('rejects a demo with no preview image and writes nothing', async () => {
      const draft = await create({ name: 'Demo', demo: 'notebook' });
      const res = await publish(draft);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: 'bad_request',
        fields: { previewImage: 'required_with_demo' },
      });
      expect(row(keys.project.published(draft.id))).toBeUndefined();
      expect(row(keys.project.meta(draft.id))).toMatchObject({
        status: 'draft',
        version: 1,
      });
    });

    it('rejects publishing changes that remove the preview image', async () => {
      const draft = await create({
        name: 'Demo',
        demo: 'notebook',
        previewImage: '/media/a/b.png',
      });
      const published = (await publish(draft)).body;
      const edited = await call('PUT', `/api/admin/projects/${draft.id}`, {
        version: published.version,
        previewImage: null,
      });
      expect(edited.status).toBe(200);
      const res = await publish(edited.body);
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual({ previewImage: 'required_with_demo' });
      expect(row(keys.project.published(draft.id))?.previewImage).toBe(
        '/media/a/b.png',
      );
    });

    it('publishes with both set, or once the demo is cleared', async () => {
      const both = await create({
        name: 'Both',
        demo: 'posts',
        previewImage: '/media/a/b.png',
      });
      expect((await publish(both)).status).toBe(200);

      const demoOnly = await create({ name: 'Demo only', demo: 'notebook' });
      const cleared = await call('PUT', `/api/admin/projects/${demoOnly.id}`, {
        version: demoOnly.version,
        demo: null,
      });
      expect((await publish(cleared.body)).status).toBe(200);
    });

    it('a stale version is still a 409, not the preview error', async () => {
      const draft = await create({ name: 'Demo', demo: 'notebook' });
      const res = await call(
        'POST',
        `/api/admin/projects/${draft.id}/publish`,
        { version: draft.version + 1 },
      );
      expect(res.status).toBe(409);
    });
  });

  it('a missing project is a 404 naming it', async () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const res = await call('GET', `/api/admin/projects/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'not_found',
      message: `Project ${id} not found`,
    });
  });

  it('checks many project ids with one BatchGet', async () => {
    const memory = createMemoryDoc();
    const repo = new ProjectsRepository(memory.doc, TABLE);
    const live = await repo.create(
      CreateProjectRequestSchema.parse({ name: 'Live' }),
    );
    const gone = await repo.create(
      CreateProjectRequestSchema.parse({ name: 'Gone' }),
    );
    await repo.softDelete(gone.id, gone.version);
    const send = vi.mocked(memory.doc.send);
    send.mockClear();
    const found = await repo.existingIds([
      live.id,
      gone.id,
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ]);
    expect([...found]).toEqual([live.id]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stamps writes with the injected clock', async () => {
    const memory = createMemoryDoc();
    const repo = new ProjectsRepository(
      memory.doc,
      TABLE,
      () => '2026-01-02T03:04:05.000Z',
    );
    const draft = await repo.create(
      CreateProjectRequestSchema.parse({ name: 'Clocked' }),
    );
    const live = await repo.publish(draft.id, draft.version);
    expect(draft.updatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(live).toMatchObject({
      updatedAt: '2026-01-02T03:04:05.000Z',
      publishedAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('rejects a non-ULID id', async () => {
    expect((await call('GET', '/api/admin/projects/not-an-id')).status).toBe(
      400,
    );
  });
});
