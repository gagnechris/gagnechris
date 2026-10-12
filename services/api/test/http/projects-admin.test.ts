import { describe, expect, it } from 'vitest';
import {
  MAX_SLUG_LENGTH,
  PROJECT_LINKS_MAX,
  PROJECT_LINK_LABEL_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_ORDER_MAX,
  PROJECT_PITCH_MAX_LENGTH,
  PROJECT_STACK_ITEM_MAX_LENGTH,
  PROJECT_STACK_MAX,
  PROJECT_STAGE_NOTE_MAX_LENGTH,
} from '@gagnechris/shared';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import type { Project } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('projects-admin');
const { call, ok, row } = siteAdminClient(h);

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const create = (body: Record<string, unknown> = {}): Promise<Project> =>
  ok('POST', '/api/admin/projects', { body: { name: 'A project', ...body } });

const act = (p: Project, verb: string): Promise<Project> =>
  ok('POST', `/api/admin/projects/${p.id}/${verb}`, {
    body: { version: p.version },
  });

const edit = (p: Project, body: Record<string, unknown>): Promise<Project> =>
  ok('PUT', `/api/admin/projects/${p.id}`, {
    body: { version: p.version, ...body },
  });

const seed = async (id: string, fields: Record<string, unknown>) => {
  const item = {
    ...keys.project.meta(id),
    entityType: 'project',
    projectId: id,
    slug: id.toLowerCase(),
    name: id,
    pitch: '',
    stage: 'idea',
    stageNote: '',
    previewImage: null,
    bodyMarkdown: '',
    stack: [],
    links: [],
    demo: null,
    order: 0,
    href: null,
    status: 'draft',
    publishedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    gsi1pk: 'PROJECT_STATUS#draft',
    gsi1sk: `ORDER#000000#PROJECT#${id}`,
    ...fields,
  };
  await h.doc.send(new PutCommand({ TableName: h.tableName, Item: item }));
  return item;
};

describe('POST /api/admin/projects', () => {
  it('stores the draft with defaults and its slug claim', async () => {
    const p = await create({
      name: '  Note Book  ',
      stack: [' Go ', 'Go', 'TypeScript'],
      links: [{ label: ' Repo ', url: 'https://github.com/x', extra: 1 }],
      extra: 'dropped',
    });
    expect(p).toEqual({
      id: expect.stringMatching(ULID),
      slug: 'note-book',
      name: 'Note Book',
      pitch: '',
      stage: 'idea',
      stageNote: '',
      previewImage: null,
      bodyMarkdown: '',
      stack: ['Go', 'TypeScript'],
      links: [{ label: 'Repo', url: 'https://github.com/x' }],
      demo: null,
      order: 0,
      href: null,
      status: 'draft',
      publishedAt: null,
      updatedAt: expect.stringMatching(ISO),
      version: 1,
      hasUnpublishedChanges: false,
    });
    expect(await row(keys.project.meta(p.id))).toEqual({
      pk: `PROJECT#${p.id}`,
      sk: 'META',
      entityType: 'project',
      projectId: p.id,
      slug: 'note-book',
      name: 'Note Book',
      pitch: '',
      stage: 'idea',
      stageNote: '',
      previewImage: null,
      bodyMarkdown: '',
      stack: ['Go', 'TypeScript'],
      links: [{ label: 'Repo', url: 'https://github.com/x' }],
      demo: null,
      order: 0,
      href: null,
      status: 'draft',
      publishedAt: null,
      updatedAt: p.updatedAt,
      version: 1,
      hasUnpublishedChanges: false,
      gsi1pk: 'PROJECT_STATUS#draft',
      gsi1sk: `ORDER#000000#PROJECT#${p.id}`,
    });
    expect(await row(keys.project.slugClaim('note-book'))).toEqual({
      ...keys.project.slugClaim('note-book'),
      entityType: 'projectSlug',
      projectId: p.id,
    });
  });

  it('takes every field', async () => {
    const body = {
      name: 'Posts',
      slug: ' My Posts ',
      pitch: 'Write',
      stage: 'live',
      stageNote: 'Since 2026',
      previewImage: '/media/2026/10/a.png',
      bodyMarkdown: '# Hi',
      stack: [],
      links: [{ label: 'Mail', url: 'mailto:a@b.c' }],
      demo: 'posts',
      order: 12,
      href: '/posts',
    };
    const p = await create(body);
    expect(p).toMatchObject({ ...body, slug: 'my-posts' });
    expect((await row(keys.project.meta(p.id)))?.gsi1sk).toBe(
      `ORDER#000012#PROJECT#${p.id}`,
    );
  });

  it.each([
    [{ name: undefined }, { name: 'invalid_type' }],
    [
      {
        name: '   ',
        slug: '',
        pitch: 'x'.repeat(PROJECT_PITCH_MAX_LENGTH + 1),
        stage: 'done',
        stageNote: 'x'.repeat(PROJECT_STAGE_NOTE_MAX_LENGTH + 1),
        previewImage: 'a.png',
        bodyMarkdown: null,
        stack: 'Go',
        links: 'x',
        demo: 'other',
        order: -1,
        href: 'http://example.com',
      },
      {
        name: 'too_small',
        slug: 'too_small',
        pitch: 'too_big',
        stage: 'invalid_value',
        stageNote: 'too_big',
        previewImage: 'invalid_format',
        bodyMarkdown: 'invalid_type',
        stack: 'invalid_type',
        links: 'invalid_type',
        demo: 'invalid_value',
        order: 'too_small',
        href: 'custom',
      },
    ],
    [
      {
        name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH + 1),
        slug: 'x'.repeat(MAX_SLUG_LENGTH + 1),
        previewImage: '/media/../a.png',
        stack: [' ', 'x'.repeat(PROJECT_STACK_ITEM_MAX_LENGTH + 1), 3],
        links: [
          'x',
          { label: ' ', url: 'javascript:alert(1)' },
          {
            label: 'x'.repeat(PROJECT_LINK_LABEL_MAX_LENGTH + 1),
            url: '//evil.example',
          },
          { url: 'https://a.example@evil.example' },
        ],
        order: PROJECT_ORDER_MAX + 1,
        href: '//evil.example',
      },
      {
        name: 'too_big',
        slug: 'too_big',
        previewImage: 'custom',
        'stack.0': 'too_small',
        'stack.1': 'too_big',
        'stack.2': 'invalid_type',
        'links.0': 'invalid_type',
        'links.1.label': 'too_small',
        'links.1.url': 'custom',
        'links.2.label': 'too_big',
        'links.2.url': 'custom',
        'links.3.label': 'invalid_type',
        'links.3.url': 'custom',
        order: 'too_big',
        href: 'custom',
      },
    ],
    [
      {
        stack: Array.from({ length: PROJECT_STACK_MAX + 1 }, (_, i) => `s${i}`),
        links: Array.from({ length: PROJECT_LINKS_MAX + 1 }, () => ({
          label: 'x',
          url: '/x',
        })),
        order: 1.5,
        href: 'https://a b.example',
        previewImage: '/media/a\u00a0b.png',
      },
      {
        stack: 'too_big',
        links: 'too_big',
        order: 'invalid_type',
        href: 'custom',
        previewImage: 'invalid_format',
      },
    ],
  ])('rejects %j', async (body, fields) => {
    const res = await call('POST', '/api/admin/projects', {
      body: { name: 'A project', ...body },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
    expect((await ok('GET', '/api/admin/projects')).items).toEqual([]);
  });

  it.each(['/x', 'https://example.com/a?b#c', 'HTTPS://Example.com'])(
    'accepts href %s',
    async (href) => {
      expect((await create({ href })).href).toBe(href);
    },
  );
});

describe('GET /api/admin/projects/:id', () => {
  it('reads a lowercase id as its ULID', async () => {
    const p = await create();
    expect(
      await ok('GET', `/api/admin/projects/${p.id.toLowerCase()}`),
    ).toEqual(p);
  });

  it('answers 400 for an id that is not a ULID and 404 for a missing one', async () => {
    const bad = await call('GET', '/api/admin/projects/not-a-ulid');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      error: 'bad_request',
      message: 'Invalid path parameters',
      fields: { id: 'invalid_format' },
    });
    const missing = await call(
      'GET',
      '/api/admin/projects/01K6G0000000000000000PRJ01',
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: 'not_found',
      message: 'Project 01K6G0000000000000000PRJ01 not found',
    });
  });

  it('checks the body before the id', async () => {
    const res = await call('PUT', '/api/admin/projects/nope', {
      body: { version: 'x' },
    });
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields: { version: 'invalid_type' },
    });
  });

  it('answers 500 data_integrity for a corrupt row', async () => {
    h.corruptRow(keys.project.meta('01K6G0000000000000000PRJ02'));
    await seed('01K6G0000000000000000PRJ02', { links: [{ label: '' }] });
    const res = await call(
      'GET',
      '/api/admin/projects/01K6G0000000000000000PRJ02',
    );
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'data_integrity',
      message: 'Stored data failed validation',
    });
  });
});

describe('PUT /api/admin/projects/:id', () => {
  it('changes only the fields sent; null clears the nullable ones', async () => {
    const p = await create({
      previewImage: '/media/a.png',
      demo: 'posts',
      href: '/a',
      stack: ['Go'],
      links: [{ label: 'A', url: '/a' }],
      order: 3,
    });
    const kept = await edit(p, { pitch: 'New' });
    expect(kept).toEqual({
      ...p,
      pitch: 'New',
      updatedAt: expect.stringMatching(ISO),
      version: 2,
    });
    const cleared = await edit(kept, {
      name: ' Renamed ',
      previewImage: null,
      demo: null,
      href: null,
      stack: [' TS ', 'TS'],
      links: [],
      order: 0,
    });
    expect(cleared).toMatchObject({
      name: 'Renamed',
      slug: p.slug,
      previewImage: null,
      demo: null,
      href: null,
      stack: ['TS'],
      links: [],
      order: 0,
      version: 3,
    });
    expect((await row(keys.project.meta(p.id)))?.gsi1sk).toBe(
      `ORDER#000000#PROJECT#${p.id}`,
    );
  });

  it('answers 409 conflict with the current project for a stale version', async () => {
    const p = await create();
    const res = await call('PUT', `/api/admin/projects/${p.id}`, {
      body: { version: 9, pitch: 'x' },
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'conflict',
      message: 'Version conflict: expected 9, current 1',
      currentVersion: 1,
      current: p,
    });
  });
});

describe('publish, discard and delete', () => {
  it('writes the PUBLISHED row without GSI keys or the flag', async () => {
    const p = await create({ name: 'Live', stage: 'live', order: 2 });
    const published = await act(p, 'publish');
    expect(published).toMatchObject({
      status: 'published',
      publishedAt: published.updatedAt,
      version: 2,
      hasUnpublishedChanges: false,
    });
    const {
      gsi1pk: _pk,
      gsi1sk: _sk,
      hasUnpublishedChanges: _flag,
      ...meta
    } = (await row(keys.project.meta(p.id)))!;
    expect(await row(keys.project.published(p.id))).toEqual({
      ...meta,
      sk: 'PUBLISHED',
    });
    expect((await row(keys.project.meta(p.id)))?.gsi1pk).toBe(
      'PROJECT_STATUS#published',
    );
    expect((await row({ pk: 'SITE#publish', sk: 'META' }))?.projectIds).toEqual(
      new Set([p.id]),
    );

    const edited = await edit(published, { pitch: 'Draft only' });
    expect(edited.hasUnpublishedChanges).toBe(true);
    expect((await row(keys.project.meta(p.id)))?.hasUnpublishedChanges).toBe(
      true,
    );
    const discarded = await act(edited, 'discard');
    expect(discarded).toMatchObject({
      pitch: '',
      status: 'published',
      publishedAt: published.publishedAt,
      version: 4,
      hasUnpublishedChanges: false,
    });

    const deleted: Project = await ok('DELETE', `/api/admin/projects/${p.id}`, {
      body: { version: discarded.version },
    });
    expect(deleted).toMatchObject({ status: 'deleted', version: 5 });
    expect(await row(keys.project.published(p.id))).toBeUndefined();
    expect(await row(keys.project.slugClaim('live'))).toBeUndefined();
    expect(
      (await row({ pk: 'SITE#publish', sk: 'META' }))?.projectIds,
    ).toBeUndefined();
  });

  it('leaves a redirect on rename and refuses a taken slug', async () => {
    const a = await create({ name: 'Alpha' });
    await create({ name: 'Beta' });
    const renamed = await edit(a, { slug: 'Gamma Ray' });
    expect(renamed.slug).toBe('gamma-ray');
    expect(await row(keys.project.slugRedirect('alpha'))).toMatchObject({
      entityType: 'projectSlugRedirect',
      projectId: a.id,
    });
    const clash = await call('PUT', `/api/admin/projects/${a.id}`, {
      body: { version: renamed.version, slug: 'beta' },
    });
    expect(clash.status).toBe(409);
    expect(clash.body).toEqual({
      error: 'slug_taken',
      message: 'Slug "beta" is already taken',
    });
  });
});

describe('GET /api/admin/projects', () => {
  it('lists published then drafts, each by order, name and id', async () => {
    const make = async (name: string, order: number, publish = false) => {
      const p = await create({ name, order });
      return publish ? act(p, 'publish') : p;
    };
    const banana = await make('Banana', 1, true);
    const apple = await make('apple', 1, true);
    const zed = await make('Zed', 0, true);
    const draftB = await make('b draft', 5);
    const draftA = await make('A draft', 5);
    const draftFirst = await make('Z first', 2);
    const deleted = await make('Gone', 0);
    await ok('DELETE', `/api/admin/projects/${deleted.id}`, {
      body: { version: deleted.version },
    });

    const names = (items: Project[]) => items.map((p) => p.name);
    expect(names((await ok('GET', '/api/admin/projects')).items)).toEqual([
      zed.name,
      apple.name,
      banana.name,
      draftFirst.name,
      draftA.name,
      draftB.name,
    ]);
    expect(
      names(
        (await ok('GET', '/api/admin/projects', { query: { status: 'draft' } }))
          .items,
      ),
    ).toEqual([draftFirst.name, draftA.name, draftB.name]);

    const bad = await call('GET', '/api/admin/projects', {
      query: { status: 'deleted' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      error: 'bad_request',
      message: 'Invalid query parameters',
      fields: { status: 'invalid_value' },
    });
  });

  it('computes the flag for rows stored without one and skips corrupt rows', async () => {
    const id = '01K6G0000000000000000PRJ03';
    const published = {
      status: 'published',
      publishedAt: '2026-01-01T00:00:00.000Z',
      gsi1pk: 'PROJECT_STATUS#published',
    };
    await seed(id, { ...published, pitch: 'Edited' });
    await seed(id, { ...published, sk: 'PUBLISHED', gsi1pk: undefined });
    h.corruptRow(keys.project.meta('01K6G0000000000000000PRJ04'));
    await seed('01K6G0000000000000000PRJ04', { ...published, stage: 'nope' });

    const { items } = await ok('GET', '/api/admin/projects');
    expect(items).toEqual([
      expect.objectContaining({ id, hasUnpublishedChanges: true }),
    ]);
  });
});
