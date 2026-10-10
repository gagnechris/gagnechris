import { describe, expect, it } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  type Home,
  type Resume,
} from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('home-resume');
const { call, ok, row } = siteAdminClient(h);

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

const sitePublish = () => row({ pk: 'SITE#publish', sk: 'META' });

const put = async (item: Record<string, unknown>) => {
  await h.doc.send(new PutCommand({ TableName: h.tableName, Item: item }));
};

const act = <T extends { version: number }>(
  base: string,
  entity: T,
  verb: string,
): Promise<T> =>
  ok('POST', `${base}/${verb}`, { body: { version: entity.version } });

describe('GET /api/admin/home', () => {
  it('seeds the default draft once', async () => {
    const seeded: Home = await ok('GET', '/api/admin/home');
    const { updatedAt: _, ...defaults } = DEFAULT_HOME;
    expect(seeded).toEqual({
      ...defaults,
      updatedAt: expect.stringMatching(ISO),
      version: 1,
    });
    expect(await row(keys.singleton.home.meta())).toEqual({
      pk: 'HOME#current',
      sk: 'META',
      entityType: 'home',
      homeId: 'current',
      name: DEFAULT_HOME.name,
      title: DEFAULT_HOME.title,
      about: DEFAULT_HOME.about,
      status: 'draft',
      publishedAt: null,
      updatedAt: seeded.updatedAt,
      seo: null,
      version: 1,
    });
    expect(await ok('GET', '/api/admin/home')).toEqual(seeded);
  });

  it('answers 500 data_integrity for a corrupt row', async () => {
    await put({ ...keys.singleton.home.meta(), entityType: 'home' });
    const res = await call('GET', '/api/admin/home');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'data_integrity',
      message: 'Stored data failed validation',
    });
  });
});

describe('PUT /api/admin/home', () => {
  it('seeds the default first, then applies only the fields sent', async () => {
    const edited: Home = await ok('PUT', '/api/admin/home', {
      body: {
        version: 1,
        title: '',
        seo: { title: 'SEO', extra: 'dropped' },
        extra: 'dropped',
      },
    });
    expect(edited).toMatchObject({
      name: DEFAULT_HOME.name,
      title: '',
      about: DEFAULT_HOME.about,
      seo: { title: 'SEO' },
      status: 'draft',
      version: 2,
      hasUnpublishedChanges: false,
    });
    expect((await row(keys.singleton.home.meta()))?.seo).toEqual({
      title: 'SEO',
    });

    const cleared: Home = await ok('PUT', '/api/admin/home', {
      body: { version: 2, name: 'Ada', seo: null },
    });
    expect(cleared).toMatchObject({ name: 'Ada', title: '', seo: null });
    expect((await row(keys.singleton.home.meta()))?.seo).toBeNull();
  });

  it.each([
    [{}, { version: 'invalid_type' }],
    [
      { version: -1, name: '', title: 5, about: null, seo: 'x' },
      {
        version: 'too_small',
        name: 'too_small',
        title: 'invalid_type',
        about: 'invalid_type',
        seo: 'invalid_type',
      },
    ],
    [
      { version: 1, seo: { title: 5, ogImage: null } },
      { 'seo.title': 'invalid_type', 'seo.ogImage': 'invalid_type' },
    ],
  ])('rejects %j', async (body, fields) => {
    const res = await call('PUT', '/api/admin/home', { body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
  });

  it('answers 409 conflict with the current home for a stale version', async () => {
    const home: Home = await ok('GET', '/api/admin/home');
    const res = await call('PUT', '/api/admin/home', {
      body: { version: 7, about: 'Nope' },
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'conflict',
      message: 'Version conflict: expected 7, current 1',
      currentVersion: 1,
      current: home,
    });
  });
});

describe('home publish, unpublish and discard', () => {
  it('mirrors the draft to PUBLISHED and moves only the site generation', async () => {
    const base = '/api/admin/home';
    const draft: Home = await ok('GET', base);
    const before = (await sitePublish())?.generation ?? 0;

    const published = await act(base, draft, 'publish');
    expect(published).toMatchObject({
      status: 'published',
      publishedAt: published.updatedAt,
      version: 2,
      hasUnpublishedChanges: false,
    });
    expect(await row(keys.singleton.home.published())).toEqual({
      ...(await row(keys.singleton.home.meta())),
      sk: 'PUBLISHED',
    });
    const site = await sitePublish();
    expect(site).toMatchObject({
      entityType: 'sitePublish',
      generation: before + 1,
    });
    expect(site?.projectIds).toBeUndefined();
    expect(site?.postIds).toBeUndefined();

    expect(await act(base, published, 'publish')).toEqual(published);

    const edited: Home = await ok('PUT', base, {
      body: { version: published.version, about: 'Draft only' },
    });
    expect(edited.hasUnpublishedChanges).toBe(true);
    expect((await row(keys.singleton.home.published()))?.about).toBe(
      DEFAULT_HOME.about,
    );

    const discarded = await act(base, edited, 'discard');
    expect(discarded).toMatchObject({
      about: DEFAULT_HOME.about,
      status: 'published',
      publishedAt: published.publishedAt,
      version: 4,
      hasUnpublishedChanges: false,
    });

    const unpublished = await act(base, discarded, 'unpublish');
    expect(unpublished).toMatchObject({
      status: 'draft',
      publishedAt: published.publishedAt,
      version: 5,
    });
    expect(await row(keys.singleton.home.published())).toBeUndefined();
    expect((await sitePublish())?.generation).toBe(before + 2);
    expect(await act(base, unpublished, 'unpublish')).toEqual(unpublished);
  });

  it('publishes before the first read by seeding the default', async () => {
    const published: Home = await ok('POST', '/api/admin/home/publish', {
      body: { version: 1 },
    });
    expect(published).toMatchObject({
      name: DEFAULT_HOME.name,
      status: 'published',
      version: 2,
    });
  });
});

const experience = {
  title: 'Director',
  company: 'Acme',
  bullets: ['Led'],
  start: '2020-01',
  end: null,
  note: 'Remote',
};

const content = {
  headline: 'Director',
  earlierRolesThrough: 2012,
  summary: 'Summary',
  competencies: ['Leading'],
  experience: [
    experience,
    { title: 'Engineer', company: 'Beta (2010 - 2019)', bullets: [] },
  ],
  skills: ['Go'],
  education: [
    {
      title: 'BS',
      institution: 'State',
      location: 'Here',
      year: '2004',
      degreeDetail: 'CS',
    },
  ],
};

describe('/api/admin/resume', () => {
  it('seeds the default draft with its content', async () => {
    const seeded: Resume = await ok('GET', '/api/admin/resume');
    const { updatedAt: _, ...defaults } = DEFAULT_RESUME;
    expect(seeded).toEqual({
      ...defaults,
      updatedAt: expect.stringMatching(ISO),
      version: 1,
    });
    expect(await row(keys.singleton.resume.meta())).toEqual({
      pk: 'RESUME#current',
      sk: 'META',
      entityType: 'resume',
      resumeId: 'current',
      name: DEFAULT_RESUME.name,
      pdfPath: DEFAULT_RESUME.pdfPath,
      content: DEFAULT_RESUME.content,
      status: 'draft',
      publishedAt: null,
      updatedAt: seeded.updatedAt,
      seo: null,
      version: 1,
    });
  });

  it('stores the content sent, unknown keys dropped, and publishes it', async () => {
    await ok('GET', '/api/admin/resume');
    const edited: Resume = await ok('PUT', '/api/admin/resume', {
      body: {
        version: 1,
        pdfPath: '/cv.pdf',
        content: {
          ...content,
          extra: true,
          experience: [{ ...experience, extra: 1 }, content.experience[1]],
        },
      },
    });
    expect(edited.content).toEqual(content);
    expect(edited.pdfPath).toBe('/cv.pdf');
    expect((await row(keys.singleton.resume.meta()))?.content).toEqual(content);

    const published = await act('/api/admin/resume', edited, 'publish');
    expect(await row(keys.singleton.resume.published())).toEqual({
      ...(await row(keys.singleton.resume.meta())),
      sk: 'PUBLISHED',
    });
    expect(published.content).toEqual(content);

    const same: Resume = await ok('PUT', '/api/admin/resume', {
      body: { version: published.version, content },
    });
    expect(same.hasUnpublishedChanges).toBe(false);
  });

  it.each([
    [{ version: 1, content: null }, { content: 'invalid_type' }],
    [
      { version: 1, content: {} },
      {
        'content.summary': 'invalid_type',
        'content.competencies': 'invalid_type',
        'content.experience': 'invalid_type',
        'content.skills': 'invalid_type',
        'content.education': 'invalid_type',
      },
    ],
    [
      {
        version: 1,
        pdfPath: '',
        content: {
          ...content,
          earlierRolesThrough: 1899,
          competencies: [1],
          experience: [
            'x',
            { ...experience, start: '2020-13' },
            { ...experience, start: undefined, end: '2020-01' },
            { ...experience, end: '2019-12' },
            { ...experience, bullets: 'x', end: '2019-12' },
          ],
          education: [{ title: 'BS' }],
        },
      },
      {
        pdfPath: 'too_small',
        'content.earlierRolesThrough': 'too_small',
        'content.competencies.0': 'invalid_type',
        'content.experience.0': 'invalid_type',
        'content.experience.1.start': 'invalid_format',
        'content.experience.2.end': 'custom',
        'content.experience.3.end': 'custom',
        'content.experience.4.bullets': 'invalid_type',
        'content.education.0.institution': 'invalid_type',
        'content.education.0.location': 'invalid_type',
        'content.education.0.year': 'invalid_type',
      },
    ],
    [
      { version: 1, content: { ...content, earlierRolesThrough: 2000.5 } },
      { 'content.earlierRolesThrough': 'invalid_type' },
    ],
  ])('rejects %j', async (body, fields) => {
    const res = await call('PUT', '/api/admin/resume', { body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
  });

  it('answers 500 data_integrity for stored content that fails the schema', async () => {
    await put({
      ...keys.singleton.resume.meta(),
      entityType: 'resume',
      name: 'Ada',
      pdfPath: '/resume.pdf',
      content: { ...content, experience: [{ ...experience, end: '2019-01' }] },
      status: 'draft',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    });
    const res = await call('GET', '/api/admin/resume');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'data_integrity',
      message: 'Stored data failed validation',
    });
  });
});
