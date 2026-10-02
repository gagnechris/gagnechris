import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { ConflictError } from '../../src/data/errors.js';
import { HomeRepository } from '../../src/home/repository.js';
import { ResumeRepository } from '../../src/resume/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

describe('publishable singletons (DynamoDB Local)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('publishable');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  it('home publish, unpublish, and discard (PUBLISHED row)', async () => {
    const homeRepo = new HomeRepository(doc, tableName);
    const seeded = await homeRepo.getOrCreate();
    expect(seeded.status).toBe('draft');

    const published = await homeRepo.publish(seeded.version);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
    const publishedRow = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.singleton.home.published(),
      }),
    );
    expect(publishedRow.Item).toBeTruthy();

    const edited = await homeRepo.update({
      version: published.version,
      about: 'Integration draft edit.',
    });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await homeRepo.discard(edited.version);
    expect(discarded.about).toBe(published.about);
    expect(discarded.hasUnpublishedChanges).toBe(false);

    const unpublished = await homeRepo.unpublish(discarded.version);
    expect(unpublished.status).toBe('draft');
    expect(unpublished.publishedAt).toBe(published.publishedAt);
    const afterUnpublish = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.singleton.home.published(),
      }),
    );
    expect(afterUnpublish.Item).toBeUndefined();
  });

  it('resume publish, unpublish, and discard', async () => {
    const resumeRepo = new ResumeRepository(doc, tableName);
    const seeded = await resumeRepo.getOrCreate();
    expect(seeded.status).toBe('draft');

    const published = await resumeRepo.publish(seeded.version);
    expect(published.status).toBe('published');
    const publishedRow = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.singleton.resume.published(),
      }),
    );
    expect(publishedRow.Item).toBeTruthy();

    const edited = await resumeRepo.update({
      version: published.version,
      content: {
        ...DEFAULT_RESUME.content,
        summary: 'Integration draft edit.',
      },
    });
    expect(edited.hasUnpublishedChanges).toBe(true);

    const discarded = await resumeRepo.discard(edited.version);
    expect(discarded.hasUnpublishedChanges).toBe(false);

    const unpublished = await resumeRepo.unpublish(discarded.version);
    expect(unpublished.status).toBe('draft');
    const afterUnpublish = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.singleton.resume.published(),
      }),
    );
    expect(afterUnpublish.Item).toBeUndefined();
  });

  it('returns ConflictError on stale home version', async () => {
    const homeRepo = new HomeRepository(doc, tableName);
    await homeRepo.getOrCreate();
    await expect(
      homeRepo.update({ version: 999, about: 'nope' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
