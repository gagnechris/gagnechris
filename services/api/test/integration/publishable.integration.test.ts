import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { ConflictError } from '../../src/data/errors.js';
import { HomeRepository } from '../../src/home/repository.js';
import { ResumeRepository } from '../../src/resume/repository.js';
import {
  createLocalDocClient,
  integrationTableName,
  truncateTable,
} from '../support/dynamo-local.js';

describe('publishable singletons (DynamoDB Local)', () => {
  const tableName = integrationTableName();
  const doc = createLocalDocClient();

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  it('home publish, unpublish, and discard', async () => {
    const homeRepo = new HomeRepository(doc, tableName);
    const seeded = await homeRepo.getOrCreate();
    expect(seeded.status).toBe('draft');

    const published = await homeRepo.publish();
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();

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
  });

  it('resume publish, unpublish, and discard', async () => {
    const resumeRepo = new ResumeRepository(doc, tableName);
    const seeded = await resumeRepo.getOrCreate();
    expect(seeded.status).toBe('draft');

    const published = await resumeRepo.publish();
    expect(published.status).toBe('published');

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

    await resumeRepo.unpublish(discarded.version);
  });

  it('returns ConflictError on stale home version', async () => {
    const homeRepo = new HomeRepository(doc, tableName);
    const current = await homeRepo.getOrCreate();
    void current;
    await expect(
      homeRepo.update({ version: 999, about: 'nope' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
