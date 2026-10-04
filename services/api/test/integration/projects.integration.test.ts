import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GSI1_NAME, keys, projectStatusGsi1Pk } from '@gagnechris/data';
import { ProjectsRepository } from '../../src/projects/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

describe('projects (DynamoDB Local)', () => {
  let tableName: string;
  let repo: ProjectsRepository;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('projects');
    repo = new ProjectsRepository(doc, tableName);
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  const get = async (key: { pk: string; sk: string }) =>
    (await doc.send(new GetCommand({ TableName: tableName, Key: key }))).Item;

  const publishedIds = async () =>
    (
      await doc.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI1_NAME,
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: {
            ':pk': projectStatusGsi1Pk('published'),
          },
        }),
      )
    ).Items?.map((i) => i.projectId);

  it('publish, rename, unpublish and delete keep claims and snapshot in step', async () => {
    const draft = await repo.create({
      name: 'Notebook',
      pitch: '',
      stage: 'idea',
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 1,
    });
    const published = await repo.publish(draft.id, draft.version);
    expect(await get(keys.project.published(draft.id))).toMatchObject({
      status: 'published',
      slug: 'notebook',
    });
    expect(await publishedIds()).toEqual([draft.id]);

    const renamed = await repo.update(draft.id, {
      version: published.version,
      slug: 'my-notebook',
    });
    expect(await get(keys.project.slugClaim('notebook'))).toBeUndefined();
    expect(await get(keys.project.slugClaim('my-notebook'))).toMatchObject({
      projectId: draft.id,
    });

    const unpublished = await repo.unpublish(draft.id, renamed.version);
    expect(await get(keys.project.published(draft.id))).toBeUndefined();
    expect(await publishedIds()).toEqual([]);

    await repo.softDelete(draft.id, unpublished.version);
    expect(await get(keys.project.slugClaim('my-notebook'))).toBeUndefined();
    expect(await repo.getById(draft.id)).toBeUndefined();
  });

  it('a taken slug is slug_taken and writes nothing', async () => {
    const input = {
      name: 'Posts',
      pitch: '',
      stage: 'live' as const,
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 0,
    };
    await repo.create(input);
    await expect(repo.create(input)).rejects.toMatchObject({
      code: 'slug_taken',
    });
    expect((await repo.list()).items).toHaveLength(1);
  });

  it('publish needs a preview image when a demo is set', async () => {
    const draft = await repo.create({
      name: 'Notebook',
      pitch: '',
      stage: 'live',
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 0,
      demo: 'notebook',
    });
    await expect(repo.publish(draft.id, draft.version)).rejects.toMatchObject({
      name: 'BadRequestError',
      fields: { previewImage: 'required_with_demo' },
    });
    expect(await get(keys.project.published(draft.id))).toBeUndefined();
    expect(await publishedIds()).toEqual([]);

    const withImage = await repo.update(draft.id, {
      version: draft.version,
      previewImage: '/media/2026/10/notebook.png',
    });
    await repo.publish(draft.id, withImage.version);
    expect(await get(keys.project.published(draft.id))).toMatchObject({
      demo: 'notebook',
      previewImage: '/media/2026/10/notebook.png',
    });
  });
});
