import { describe, expect, it } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GSI1_NAME, keys, projectStatusGsi1Pk } from '@gagnechris/data';
import type { Project } from '@gagnechris/shared';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('projects');
const { call, ok, row: get } = siteAdminClient(h);

const publishedIds = async () =>
  (
    await h.doc.send(
      new QueryCommand({
        TableName: h.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: {
          ':pk': projectStatusGsi1Pk('published'),
        },
      }),
    )
  ).Items?.map((i) => i.projectId);

const action = (id: string, verb: string, version: number): Promise<Project> =>
  ok('POST', `/api/admin/projects/${id}/${verb}`, { body: { version } });

describe('projects over HTTP (DynamoDB Local)', () => {
  it('publish, rename, unpublish and delete keep claims and snapshot in step', async () => {
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
    const published = await action(draft.id, 'publish', draft.version);
    expect(await get(keys.project.published(draft.id))).toMatchObject({
      status: 'published',
      slug: 'notebook',
    });
    expect(await publishedIds()).toEqual([draft.id]);

    const renamed: Project = await ok(
      'PUT',
      `/api/admin/projects/${draft.id}`,
      {
        body: { version: published.version, slug: 'my-notebook' },
      },
    );
    expect(await get(keys.project.slugClaim('notebook'))).toBeUndefined();
    expect(await get(keys.project.slugClaim('my-notebook'))).toMatchObject({
      projectId: draft.id,
    });

    const unpublished = await action(draft.id, 'unpublish', renamed.version);
    expect(await get(keys.project.published(draft.id))).toBeUndefined();
    expect(await publishedIds()).toEqual([]);

    await ok('DELETE', `/api/admin/projects/${draft.id}`, {
      body: { version: unpublished.version },
    });
    expect(await get(keys.project.slugClaim('my-notebook'))).toBeUndefined();
    expect((await call('GET', `/api/admin/projects/${draft.id}`)).status).toBe(
      404,
    );
  });

  it('a taken slug is slug_taken and writes nothing', async () => {
    const input = {
      name: 'Posts',
      pitch: '',
      stage: 'live',
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 0,
    };
    await ok('POST', '/api/admin/projects', { body: input });
    const clash = await call('POST', '/api/admin/projects', { body: input });
    expect(clash.status).toBe(409);
    expect(clash.body).toMatchObject({ error: 'slug_taken' });
    expect((await ok('GET', '/api/admin/projects')).items).toHaveLength(1);
  });

  it('publish needs a preview image when a demo is set', async () => {
    const draft: Project = await ok('POST', '/api/admin/projects', {
      body: {
        name: 'Notebook',
        pitch: '',
        stage: 'live',
        stageNote: '',
        bodyMarkdown: '',
        stack: [],
        links: [],
        order: 0,
        demo: 'notebook',
      },
    });
    const refused = await call(
      'POST',
      `/api/admin/projects/${draft.id}/publish`,
      { body: { version: draft.version } },
    );
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({
      error: 'bad_request',
      fields: { previewImage: 'required_with_demo' },
    });
    expect(await get(keys.project.published(draft.id))).toBeUndefined();
    expect(await publishedIds()).toEqual([]);

    const withImage: Project = await ok(
      'PUT',
      `/api/admin/projects/${draft.id}`,
      {
        body: {
          version: draft.version,
          previewImage: '/media/2026/10/notebook.png',
        },
      },
    );
    await action(draft.id, 'publish', withImage.version);
    expect(await get(keys.project.published(draft.id))).toMatchObject({
      demo: 'notebook',
      previewImage: '/media/2026/10/notebook.png',
    });
  });
});
