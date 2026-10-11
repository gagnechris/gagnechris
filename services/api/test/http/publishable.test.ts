import { describe, expect, it } from 'vitest';
import { keys } from '@gagnechris/data';
import { DEFAULT_RESUME, type Home, type Resume } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('publishable');
const { call, ok, row } = siteAdminClient(h);

const action = <T>(base: string, verb: string, version: number): Promise<T> =>
  ok('POST', `${base}/${verb}`, { body: { version } });

describe('publishable singletons over HTTP (DynamoDB Local)', () => {
  it('home publish, unpublish, and discard (PUBLISHED row)', async () => {
    const base = '/api/admin/home';
    const seeded: Home = await ok('GET', base);
    expect(seeded.status).toBe('draft');

    const published = await action<Home>(base, 'publish', seeded.version);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
    expect(await row(keys.singleton.home.published())).toBeTruthy();

    const edited: Home = await ok('PUT', base, {
      body: { version: published.version, about: 'Integration draft edit.' },
    });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await action<Home>(base, 'discard', edited.version);
    expect(discarded.about).toBe(published.about);
    expect(discarded.hasUnpublishedChanges).toBe(false);

    const unpublished = await action<Home>(
      base,
      'unpublish',
      discarded.version,
    );
    expect(unpublished.status).toBe('draft');
    expect(unpublished.publishedAt).toBe(published.publishedAt);
    expect(await row(keys.singleton.home.published())).toBeUndefined();
  });

  it('resume publish, unpublish, and discard', async () => {
    const base = '/api/admin/resume';
    const seeded: Resume = await ok('GET', base);
    expect(seeded.status).toBe('draft');

    const published = await action<Resume>(base, 'publish', seeded.version);
    expect(published.status).toBe('published');
    expect(await row(keys.singleton.resume.published())).toBeTruthy();

    const edited: Resume = await ok('PUT', base, {
      body: {
        version: published.version,
        content: {
          ...DEFAULT_RESUME.content,
          summary: 'Integration draft edit.',
        },
      },
    });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await action<Resume>(base, 'discard', edited.version);
    expect(discarded.hasUnpublishedChanges).toBe(false);

    const unpublished = await action<Resume>(
      base,
      'unpublish',
      discarded.version,
    );
    expect(unpublished.status).toBe('draft');
    expect(await row(keys.singleton.resume.published())).toBeUndefined();
  });

  it('returns 409 on stale home version', async () => {
    await ok('GET', '/api/admin/home');
    const res = await call('PUT', '/api/admin/home', {
      body: { version: 999, about: 'nope' },
    });
    expect(res.status).toBe(409);
  });
});
