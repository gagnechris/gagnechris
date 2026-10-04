import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  buildResumeMetaItem,
  buildResumePublishedItem,
  keys,
} from '@gagnechris/data';
import { DEFAULT_RESUME, type Resume } from '@gagnechris/shared';
import { renderResumePrerenderHtml } from '@gagnechris/shared/render';
import {
  LEGACY_COMPANY_LINES,
  legacyResume,
} from '@gagnechris/shared/fixtures/legacy-resume';
import { createResumeRoutes } from '../../src/resume/handlers.js';
import { ResumeRepository } from '../../src/resume/repository.js';
import {
  formatResumeDateMigrationReport,
  migrateResumeDates,
  resumeDateMigrationExitCode,
} from '../../src/resume/date-migration.js';
import { dispatchRoutes } from '../../src/router.js';
import { makeEvent } from '../support/make-event.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const PUBLISHED_AT = '2026-09-27T00:00:00.000Z';
const UPDATED_AT = '2026-09-28T00:00:00.000Z';
const NOW = '2026-10-04T12:00:00.000Z';

const legacyPublished = (): Resume => ({
  ...legacyResume(),
  status: 'published',
  publishedAt: PUBLISHED_AT,
  updatedAt: UPDATED_AT,
  version: 4,
  hasUnpublishedChanges: false,
});

describe('resume date migration (DynamoDB Local)', () => {
  const doc = createLocalDocClient();
  let tableName: string;

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('resume-dates');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  async function seed(draft: Resume, published?: Resume): Promise<void> {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: buildResumeMetaItem(draft),
      }),
    );
    if (published) {
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: buildResumePublishedItem(published),
        }),
      );
    }
  }

  async function row(which: 'meta' | 'published') {
    const { Item } = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.singleton.resume[which](),
        ConsistentRead: true,
      }),
    );
    return Item as Record<string, unknown> & {
      version: number;
      updatedAt: string;
      publishedAt: string | null;
      content: Resume['content'];
    };
  }

  const run = (
    mode: 'dry-run' | 'apply' | 'verify',
    client: DynamoDBDocumentClient = doc,
  ) => migrateResumeDates({ doc: client, tableName, mode, now: () => NOW });

  const dispatch = (method: string, body?: unknown) =>
    dispatchRoutes(
      createResumeRoutes(new ResumeRepository(doc, tableName)),
      makeEvent(method, '/api/admin/resume', {
        jwtClaims: { sub: 'admin-1' },
        ...(body ? { body } : {}),
      }),
      method,
      '/api/admin/resume',
    );

  it('serves and saves old-shape rows without a data_integrity error', async () => {
    const legacy = legacyPublished();
    await seed(legacy, legacy);

    const got = await dispatch('GET');
    expect(got.statusCode).toBe(200);
    const body = JSON.parse(got.body as string) as Resume;
    expect(body.content.experience.map((e) => e.company)).toEqual([
      ...LEGACY_COMPANY_LINES,
    ]);
    expect(body.hasUnpublishedChanges).toBe(false);

    const saved = await dispatch('PUT', {
      version: legacy.version,
      content: legacy.content,
    });
    expect(saved.statusCode).toBe(200);
  });

  it('PUT then GET round-trips start, end, note, headline and cut-off', async () => {
    const legacy = legacyPublished();
    await seed(legacy, legacy);
    const content = structuredClone(DEFAULT_RESUME.content);
    content.experience[3]!.note = 'contract, concurrent';

    const saved = await dispatch('PUT', { version: legacy.version, content });
    expect(saved.statusCode).toBe(200);
    const got = await dispatch('GET');
    const body = JSON.parse(got.body as string) as Resume;
    expect(body.content).toEqual(content);
    expect(body.content.headline).toBe('Director of Software Engineering');
    expect(body.content.earlierRolesBefore).toBe(2012);
    expect(body.content.experience[0]).toMatchObject({
      start: '2019-07',
      end: null,
    });
    expect(body.hasUnpublishedChanges).toBe(true);
  });

  it('dry run lists every experience row with its parsed dates and writes nothing', async () => {
    const legacy = legacyPublished();
    await seed(legacy, legacy);

    const report = await run('dry-run');

    expect(report.rows.map((r) => [r.sk, r.status, r.version])).toEqual([
      ['META', 'pending', 4],
      ['PUBLISHED', 'pending', 4],
    ]);
    for (const r of report.rows) {
      expect(r.experience).toEqual(
        DEFAULT_RESUME.content.experience.map((e, index) => ({
          index,
          status: 'migrated',
          company: e.company,
          start: e.start,
          end: e.end,
        })),
      );
    }
    const lines = formatResumeDateMigrationReport(report);
    expect(lines).toContain('  [0] migrated "Ro" start=2019-07 end=present');
    expect(lines).toContain(
      '  [8] migrated "Daystar Corporation" start=1999-01 end=2000-04',
    );
    expect(lines.join('\n')).not.toContain(
      DEFAULT_RESUME.content.experience[0]!.bullets[0]!,
    );
    expect(lines.join('\n')).not.toContain(DEFAULT_RESUME.content.summary);
    expect((await row('meta')).version).toBe(4);
    expect((await row('meta')).content.experience[0]!.company).toBe(
      'Ro | July 2019 - Present',
    );
    expect(resumeDateMigrationExitCode(await run('verify'))).toBe(2);
  });

  it('--apply migrates draft and published, bumps versions, and is idempotent', async () => {
    const legacy = legacyPublished();
    await seed(legacy, legacy);
    const htmlBefore = renderResumePrerenderHtml(legacy, 2026);

    const applied = await run('apply');
    expect(applied.rows.map((r) => r.status)).toEqual(['written', 'written']);
    expect(resumeDateMigrationExitCode(applied)).toBe(0);

    const meta = await row('meta');
    const published = await row('published');
    expect(meta.content.experience).toEqual(DEFAULT_RESUME.content.experience);
    expect(published.content).toEqual(meta.content);
    expect(meta.version).toBe(5);
    expect(meta.updatedAt).toBe(NOW);
    expect(published.version).toBe(5);
    expect(published.updatedAt).toBe(UPDATED_AT);
    expect(published.publishedAt).toBe(PUBLISHED_AT);

    const repo = new ResumeRepository(doc, tableName);
    const entity = await repo.get();
    expect(entity?.hasUnpublishedChanges).toBe(false);
    const publishedEntity = {
      ...legacy,
      content: published.content,
      version: published.version,
    };
    expect(renderResumePrerenderHtml(publishedEntity, 2026)).toBe(htmlBefore);

    const again = await run('apply');
    expect(again.rows.map((r) => r.status)).toEqual([
      'up-to-date',
      'up-to-date',
    ]);
    expect((await row('meta')).version).toBe(5);
    expect((await row('published')).version).toBe(5);

    const verified = await run('verify');
    expect(resumeDateMigrationExitCode(verified)).toBe(0);
  });

  it('migrates a draft-only resume and reports the missing published row', async () => {
    const draft: Resume = {
      ...legacyResume(),
      status: 'draft',
      publishedAt: null,
      updatedAt: UPDATED_AT,
      version: 2,
      hasUnpublishedChanges: false,
    };
    await seed(draft);

    const report = await run('apply');
    expect(report.rows.map((r) => [r.sk, r.status])).toEqual([
      ['META', 'written'],
      ['PUBLISHED', 'missing'],
    ]);
    expect((await row('meta')).version).toBe(3);
  });

  it('only migrates the published snapshot when the draft is already structured', async () => {
    const legacy = legacyPublished();
    const draft: Resume = {
      ...legacy,
      content: DEFAULT_RESUME.content,
      version: 6,
    };
    await seed(draft, legacy);

    const report = await run('apply');
    expect(report.rows.map((r) => [r.sk, r.status])).toEqual([
      ['META', 'up-to-date'],
      ['PUBLISHED', 'written'],
    ]);
    expect((await row('meta')).version).toBe(6);
    expect((await row('published')).version).toBe(5);
  });

  it('reports unparseable lines, leaves them as stored, and fails verify', async () => {
    const legacy = legacyPublished();
    legacy.content.experience[3]!.company = 'Viacom | Fall 2014 - April 2015';
    await seed(legacy, legacy);

    const report = await run('apply');
    expect(report.unparseable).toBe(2);
    const lines = formatResumeDateMigrationReport(report);
    expect(lines).toContain(
      '  [3] unparseable (unknown start month): "Viacom | Fall 2014 - April 2015"',
    );
    const meta = await row('meta');
    expect(meta.content.experience[3]!).not.toHaveProperty('start');
    expect(meta.content.experience[3]!.company).toBe(
      'Viacom | Fall 2014 - April 2015',
    );
    expect(meta.content.experience[0]!.start).toBe('2019-07');
    expect(resumeDateMigrationExitCode(await run('verify'))).toBe(2);
  });

  it('writes nothing when the resume changes between read and write', async () => {
    const legacy = legacyPublished();
    await seed(legacy, legacy);
    const racing = {
      send: async (command: unknown) => {
        if (command instanceof TransactWriteCommand) {
          await new ResumeRepository(doc, tableName).update({
            version: legacy.version,
            name: 'Raced',
          });
        }
        return doc.send(command as never);
      },
    } as unknown as DynamoDBDocumentClient;

    const report = await run('apply', racing);
    expect(report.rows.map((r) => r.status)).toEqual(['conflict', 'conflict']);
    expect(resumeDateMigrationExitCode(report)).toBe(1);
    const meta = await row('meta');
    expect(meta.name).toBe('Raced');
    expect(meta.content.experience[0]!.company).toBe(
      'Ro | July 2019 - Present',
    );
    expect((await row('published')).version).toBe(4);
  });
});
