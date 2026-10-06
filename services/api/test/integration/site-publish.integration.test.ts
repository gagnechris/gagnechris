import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { parseSitePublishItem, sitePublishKey } from '@gagnechris/data';
import { HomeRepository } from '../../src/home/repository.js';
import { ProjectsRepository } from '../../src/projects/repository.js';
import { makeCtx, makePost } from '../support/builders.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

describe('site publish row (DynamoDB Local)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('site-publish');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  const state = async () =>
    parseSitePublishItem(
      (
        await doc.send(
          new GetCommand({
            TableName: tableName,
            Key: sitePublishKey(),
            ConsistentRead: true,
          }),
        )
      ).Item,
    );

  it('every post publish, unpublish and delete moves the generation and the id set with the PUBLISHED row', async () => {
    const ctx = makeCtx(doc, tableName);
    const draft = await makePost(ctx, { title: 'Tracked' });
    const other = await makePost(ctx, { title: 'Other' });
    expect(await state()).toEqual({
      generation: 0,
      postIds: [],
      projectIds: [],
    });

    const published = await ctx.posts.publish(draft.id, draft.version);
    expect(await state()).toEqual({
      generation: 1,
      postIds: [draft.id],
      projectIds: [],
    });

    const edited = await ctx.posts.update(draft.id, {
      version: published.version,
      title: 'Tracked, edited',
    });
    const discarded = await ctx.posts.discard(draft.id, edited.version);
    expect((await state()).generation).toBe(1);

    const otherPublished = await ctx.posts.publish(other.id, other.version);
    expect(await state()).toEqual({
      generation: 2,
      postIds: [draft.id, other.id].sort(),
      projectIds: [],
    });

    await ctx.posts.unpublish(draft.id, discarded.version);
    expect(await state()).toEqual({
      generation: 3,
      postIds: [other.id],
      projectIds: [],
    });

    await ctx.posts.softDelete(other.id, otherPublished.version);
    expect(await state()).toEqual({
      generation: 4,
      postIds: [],
      projectIds: [],
    });
  });

  it('projects use their own id set and home only moves the generation', async () => {
    const projects = new ProjectsRepository(doc, tableName);
    const draft = await projects.create({
      name: 'Notebook',
      pitch: '',
      stage: 'idea',
      stageNote: '',
      bodyMarkdown: '',
      stack: [],
      links: [],
      order: 1,
    });
    const published = await projects.publish(draft.id, draft.version);
    expect(await state()).toEqual({
      generation: 1,
      postIds: [],
      projectIds: [draft.id],
    });

    const home = new HomeRepository(doc, tableName);
    const seeded = await home.getOrCreate();
    await home.publish(seeded.version);
    expect(await state()).toEqual({
      generation: 2,
      postIds: [],
      projectIds: [draft.id],
    });

    await projects.unpublish(draft.id, published.version);
    expect(await state()).toEqual({
      generation: 3,
      postIds: [],
      projectIds: [],
    });
  });
});
