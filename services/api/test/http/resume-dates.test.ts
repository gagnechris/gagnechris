import { describe, expect, it } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildResumeMetaItem,
  buildResumePublishedItem,
} from '@gagnechris/data';
import { DEFAULT_RESUME, type Resume } from '@gagnechris/shared';
import {
  LEGACY_COMPANY_LINES,
  legacyResume,
} from '@gagnechris/shared/fixtures/legacy-resume';
import { useApi } from './support/harness.js';
import { siteAdminClient } from './support/site-admin.js';

const h = useApi('resume-dates');
const { call } = siteAdminClient(h);

const legacyPublished = (): Resume => ({
  ...legacyResume(),
  status: 'published',
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  version: 4,
  hasUnpublishedChanges: false,
});

async function seed(resume: Resume): Promise<void> {
  for (const Item of [
    buildResumeMetaItem(resume),
    buildResumePublishedItem(resume),
  ]) {
    await h.doc.send(new PutCommand({ TableName: h.tableName, Item }));
  }
}

describe('resume dates over HTTP (DynamoDB Local)', () => {
  it('serves and saves old-shape rows without a data_integrity error', async () => {
    const legacy = legacyPublished();
    await seed(legacy);

    const got = await call('GET', '/api/admin/resume');
    expect(got.status).toBe(200);
    const body = got.body as Resume;
    expect(body.content.experience.map((e) => e.company)).toEqual([
      ...LEGACY_COMPANY_LINES,
    ]);
    expect(body.hasUnpublishedChanges).toBe(false);

    const saved = await call('PUT', '/api/admin/resume', {
      body: { version: legacy.version, content: legacy.content },
    });
    expect(saved.status).toBe(200);
  });

  it('PUT then GET round-trips start, end, note, headline and cut-off', async () => {
    const legacy = legacyPublished();
    await seed(legacy);
    const content = structuredClone(DEFAULT_RESUME.content);
    content.experience[3]!.note = 'contract, concurrent';

    const saved = await call('PUT', '/api/admin/resume', {
      body: { version: legacy.version, content },
    });
    expect(saved.status).toBe(200);
    const got = await call('GET', '/api/admin/resume');
    const body = got.body as Resume;
    expect(body.content).toEqual(content);
    expect(body.content.headline).toBe('Director of Software Engineering');
    expect(body.content.earlierRolesThrough).toBe(2012);
    expect(body.content.experience[0]).toMatchObject({
      start: '2019-07',
      end: null,
    });
    expect(body.hasUnpublishedChanges).toBe(true);
  });
});
