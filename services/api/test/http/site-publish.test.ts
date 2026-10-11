import { describe, expect, it } from 'vitest';
import { keys, parseSitePublishItem } from '@gagnechris/data';
import type { Home, Post, Project } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('site-publish');
const { ok, row } = siteAdminClient(h);

const state = async () => parseSitePublishItem(await row(keys.sitePublish()));

const makePost = (title: string): Promise<Post> =>
  ok('POST', '/api/admin/posts', {
    body: {
      title,
      excerpt: '',
      bodyMarkdown: 'Body',
      tags: [],
      projectIds: [],
    },
  });

const action = <T>(path: string, version: number): Promise<T> =>
  ok('POST', path, { body: { version } });

describe('site publish row over HTTP (DynamoDB Local)', () => {
  it('every post publish, unpublish and delete moves the generation and the id set with the PUBLISHED row', async () => {
    const draft = await makePost('Tracked');
    const other = await makePost('Other');
    expect(await state()).toEqual({
      generation: 0,
      postIds: [],
      projectIds: [],
    });

    const post = (id: string, verb: string) => `/api/admin/posts/${id}/${verb}`;
    const published = await action<Post>(
      post(draft.id, 'publish'),
      draft.version,
    );
    expect(await state()).toEqual({
      generation: 1,
      postIds: [draft.id],
      projectIds: [],
    });

    const edited: Post = await ok('PUT', `/api/admin/posts/${draft.id}`, {
      body: { version: published.version, title: 'Tracked, edited' },
    });
    const discarded = await action<Post>(
      post(draft.id, 'discard'),
      edited.version,
    );
    expect((await state()).generation).toBe(1);

    const otherPublished = await action<Post>(
      post(other.id, 'publish'),
      other.version,
    );
    expect(await state()).toEqual({
      generation: 2,
      postIds: [draft.id, other.id].sort(),
      projectIds: [],
    });

    await action<Post>(post(draft.id, 'unpublish'), discarded.version);
    expect(await state()).toEqual({
      generation: 3,
      postIds: [other.id],
      projectIds: [],
    });

    await ok('DELETE', `/api/admin/posts/${other.id}`, {
      body: { version: otherPublished.version },
    });
    expect(await state()).toEqual({
      generation: 4,
      postIds: [],
      projectIds: [],
    });
  });

  it('projects use their own id set and home only moves the generation', async () => {
    const draft: Project = await ok('POST', '/api/admin/projects', {
      body: {
        name: 'Notebook',
        pitch: '',
        stage: 'idea',
        stageNote: '',
        bodyMarkdown: '',
        stack: [],
        links: [],
        order: 1,
      },
    });
    const published = await action<Project>(
      `/api/admin/projects/${draft.id}/publish`,
      draft.version,
    );
    expect(await state()).toEqual({
      generation: 1,
      postIds: [],
      projectIds: [draft.id],
    });

    const seeded: Home = await ok('GET', '/api/admin/home');
    await action<Home>('/api/admin/home/publish', seeded.version);
    expect(await state()).toEqual({
      generation: 2,
      postIds: [],
      projectIds: [draft.id],
    });

    await action<Project>(
      `/api/admin/projects/${draft.id}/unpublish`,
      published.version,
    );
    expect(await state()).toEqual({
      generation: 3,
      postIds: [],
      projectIds: [],
    });
  });
});
