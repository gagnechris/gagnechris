import { describe, expect, it } from 'vitest';
import {
  COUNT_FLOOR_ENTITY_TYPES,
  MAX_MESSAGE_LENGTH,
  SCHEMA_CHECKED_ENTITY_TYPES,
  checkItem,
  minRestoredCount,
  isRestoreTestTableName,
  tableNameFromArn,
  validateRestoredTable,
} from '../src/validate.js';
import {
  buildPublishedItem,
  buildResumeMetaItem,
  buildResumePublishedItem,
} from '@gagnechris/data';
import {
  DEFAULT_RESUME,
  RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
} from '@gagnechris/shared';
import { legacyResumeContent } from '@gagnechris/shared/fixtures/legacy-resume';
import { TS, fakeCount, healthyItems, noteAt, pagedScan } from './fixtures.js';

const TABLE = 'awsbackup-restore-test-abc123';

describe('validateRestoredTable', () => {
  it('passes a healthy restore across scan pages', async () => {
    const scan = pagedScan(healthyItems(), 2);
    const result = await validateRestoredTable(scan, TABLE);
    expect(result.status).toBe('SUCCESSFUL');
    expect(result.itemCount).toBe(10);
    // home, resume, note, task, daily claim, project META + PUBLISHED
    expect(result.schemaChecked).toBe(7);
    expect(result.problems).toEqual([]);
    expect(scan.calls).toBe(5);
    expect(result.message).toMatch(/^OK: 10 items/);
  });

  it('fails an empty table', async () => {
    const result = await validateRestoredTable(pagedScan([]), TABLE);
    expect(result.status).toBe('FAILED');
    expect(result.problems[0]).toBe('restored table is empty');
  });

  it('fails when a singleton row is missing', async () => {
    const items = healthyItems().filter((i) => i.entityType !== 'resume');
    const result = await validateRestoredTable(pagedScan(items), TABLE);
    expect(result.status).toBe('FAILED');
    expect(result.problems).toContain(
      'missing required row RESUME#current/META',
    );
  });

  it('fails a corrupt note without echoing its content', async () => {
    const items = healthyItems().map((i) =>
      i.entityType === 'note' ? { ...i, version: 'x', bodyMarkdown: 42 } : i,
    );
    const result = await validateRestoredTable(pagedScan(items), TABLE);
    expect(result.status).toBe('FAILED');
    expect(result.message).toContain('note schema');
    expect(result.message).not.toContain('private text');
  });

  it('fails an item whose key does not match the key builders', async () => {
    const items = healthyItems().map((i) =>
      i.entityType === 'task' ? { ...i, pk: 'USER#other#TASK#01TASK' } : i,
    );
    const result = await validateRestoredTable(pagedScan(items), TABLE);
    expect(result.problems).toEqual([
      'USER#other#TASK#01TASK/META: task key does not match key builders',
    ]);
  });

  it('schema-checks projects and floors their count', async () => {
    expect(SCHEMA_CHECKED_ENTITY_TYPES).toContain('project');
    expect(COUNT_FLOOR_ENTITY_TYPES).toContain('project');
    const corrupt = healthyItems().map((i) =>
      i.entityType === 'project' && i.sk === 'PUBLISHED'
        ? { ...i, stage: 'someday' }
        : i,
    );
    const result = await validateRestoredTable(pagedScan(corrupt), TABLE);
    expect(result.problems).toEqual([
      'PROJECT#01PROJECT/PUBLISHED: project schema (stage)',
    ]);
    const moved = healthyItems().map((i) =>
      i.entityType === 'project' && i.sk === 'META'
        ? { ...i, pk: 'PROJECT#other' }
        : i,
    );
    expect(
      (await validateRestoredTable(pagedScan(moved), TABLE)).problems,
    ).toEqual(['PROJECT#other/META: project key does not match key builders']);
  });

  it('refuses any table that is not a restore-test scratch table', async () => {
    const scan = pagedScan(healthyItems());
    const result = await validateRestoredTable(scan, 'gagnechris-prod');
    expect(result.status).toBe('FAILED');
    expect(scan.calls).toBe(0);
  });

  it('caps the scan and the message length', async () => {
    const many = Array.from({ length: 200 }, (_, n) => ({
      pk: `X#${n}`,
      sk: 123,
    }));
    const result = await validateRestoredTable(pagedScan(many, 50), TABLE, {
      maxItems: 100,
    });
    expect(result.itemCount).toBe(100);
    expect(result.problems).toContain(
      'scan stopped after 100 items (maxItems)',
    );
    expect(result.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(result.message).toMatch(/\+\d+ more/);
  });
});

describe('count floor', () => {
  const SOURCE = 'gagnechris-prod';
  // Fixture rows are stamped TS (2026-10-01T12:00Z); the restore point is later.
  const RESTORE_POINT = new Date('2026-10-02T07:00:00.000Z');
  const BEFORE = '2026-10-02T06:00:00.000Z';
  const AFTER = '2026-10-02T08:00:00.000Z';
  const floor = (source: Record<string, unknown>[]) => ({
    count: fakeCount(source),
    sourceTable: SOURCE,
    restorePoint: RESTORE_POINT,
  });
  const extraNotes = (ts: string, n: number) =>
    Array.from({ length: n }, (_, i) => noteAt(`01PAGE${i}`, ts));

  it('fails a restore with fewer notes than the source had at the restore point', async () => {
    const source = [...healthyItems(), ...extraNotes(BEFORE, 2)];
    const restored = healthyItems();
    const result = await validateRestoredTable(pagedScan(restored), TABLE, {
      floor: floor(source),
    });
    expect(result.status).toBe('FAILED');
    expect(result.problems).toEqual([
      expect.stringMatching(
        /^note count 1 below floor 3 \(3 in gagnechris-prod before /,
      ),
    ]);
    expect(result.message).not.toContain('private text');
  });

  it('fails a restore that lost every note', async () => {
    const source = healthyItems();
    const restored = healthyItems().filter((i) => i.entityType !== 'note');
    const result = await validateRestoredTable(pagedScan(restored), TABLE, {
      floor: floor(source),
    });
    expect(result.status).toBe('FAILED');
    expect(result.problems[0]).toMatch(/^note count 0 below floor 1 /);
  });

  it('ignores rows created or edited after the restore point', async () => {
    const source = [...healthyItems(), ...extraNotes(AFTER, 5)];
    const result = await validateRestoredTable(
      pagedScan(healthyItems()),
      TABLE,
      { floor: floor(source) },
    );
    expect(result.status).toBe('SUCCESSFUL');
    expect(result.message).toContain('counts at floor');
  });

  it('allows a 10% shortfall on larger types only', async () => {
    const source = [...healthyItems(), ...extraNotes(BEFORE, 19)];
    const restored = [...healthyItems(), ...extraNotes(BEFORE, 17)];
    const result = await validateRestoredTable(pagedScan(restored), TABLE, {
      floor: floor(source),
    });
    expect(result.status).toBe('SUCCESSFUL');
    expect([0, 1, 2, 3, 10, 20].map(minRestoredCount)).toEqual([
      0, 1, 2, 3, 9, 18,
    ]);
  });

  it('passes a near-empty source', async () => {
    const singletons = healthyItems().filter(
      (i) => i.entityType === 'home' || i.entityType === 'resume',
    );
    const result = await validateRestoredTable(pagedScan(singletons), TABLE, {
      floor: floor(singletons),
    });
    expect(result.status).toBe('SUCCESSFUL');
  });

  it('counts the source with Select COUNT on metadata attributes only', async () => {
    const f = floor(healthyItems());
    await validateRestoredTable(pagedScan(healthyItems()), TABLE, { floor: f });
    expect(f.count.calls.length).toBeGreaterThan(0);
    for (const call of f.count.calls) {
      expect(call.TableName).toBe(SOURCE);
      expect(call.Select).toBe('COUNT');
      for (const name of Object.values(call.ExpressionAttributeNames)) {
        expect(RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES).toContain(name);
      }
    }
    expect(
      new Set(f.count.calls.map((c) => c.ExpressionAttributeValues[':t'])),
    ).toEqual(new Set(COUNT_FLOOR_ENTITY_TYPES));
    // Settle margin: 5 min before the restore point.
    expect(f.count.calls[0]!.ExpressionAttributeValues[':cut']).toBe(
      '2026-10-02T06:55:00.000Z',
    );
  });

  it('skips the floor when the restored scan was truncated', async () => {
    const f = floor(healthyItems());
    const result = await validateRestoredTable(
      pagedScan(healthyItems(), 2),
      TABLE,
      { maxItems: 2, floor: f },
    );
    expect(result.status).toBe('FAILED');
    expect(f.count.calls).toHaveLength(0);
  });

  it('floors every schema-checked type that has a timestamp', () => {
    expect(TS < RESTORE_POINT.toISOString()).toBe(true);
    expect(
      SCHEMA_CHECKED_ENTITY_TYPES.filter(
        (t) => !COUNT_FLOOR_ENTITY_TYPES.includes(t),
      ),
    ).toEqual(['dailyNoteClaim']);
  });
});

describe('helpers', () => {
  it('checkItem flags missing keys', () => {
    expect(checkItem({ sk: 'META' })).toBe('item without a string pk');
    expect(checkItem({ pk: 'A' })).toBe('A: missing string sk');
    expect(checkItem({ pk: 'A', sk: 'B', entityType: 'unknown' })).toBe(
      undefined,
    );
  });

  it('checkItem accepts post rows with or without projectIds', () => {
    const tagged = buildPublishedItem({
      id: '01POST',
      slug: 'hello',
      title: 'Hello',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
      projectIds: ['01PROJECT'],
      status: 'published',
      publishedAt: TS,
      updatedAt: TS,
      coverImage: null,
      seo: null,
      version: 1,
      hasUnpublishedChanges: false,
    });
    const { projectIds: _ids, ...legacy } = tagged;
    expect(checkItem(tagged)).toBeUndefined();
    expect(checkItem(legacy)).toBeUndefined();
    expect(checkItem({ ...tagged, projectIds: '01PROJECT' })).toBe(
      'POST#01POST/PUBLISHED: post schema (projectIds)',
    );
  });

  it('parses table names from ARNs and recognises scratch names', () => {
    expect(
      tableNameFromArn(
        'arn:aws:dynamodb:us-east-1:111111111111:table/awsbackup-restore-test-x',
      ),
    ).toBe('awsbackup-restore-test-x');
    expect(tableNameFromArn(undefined)).toBeUndefined();
    expect(tableNameFromArn('arn:aws:s3:::bucket')).toBeUndefined();
    expect(isRestoreTestTableName('awsbackup-restore-test-')).toBe(false);
    expect(isRestoreTestTableName('gagnechris-prod')).toBe(false);
  });
});

describe('resume rows across the date migration', () => {
  const resumeRows = (content: unknown) => [
    buildResumeMetaItem({
      ...DEFAULT_RESUME,
      content: content as typeof DEFAULT_RESUME.content,
      updatedAt: TS,
      version: 1,
    }),
    buildResumePublishedItem({
      ...DEFAULT_RESUME,
      content: content as typeof DEFAULT_RESUME.content,
      updatedAt: TS,
      version: 1,
    }),
  ];

  it.each([
    ['old shape (dates inside company)', legacyResumeContent()],
    ['structured start/end, headline and cut-off', DEFAULT_RESUME.content],
  ])('passes the %s', async (_label, content) => {
    const items = [
      ...healthyItems().filter((i) => i.entityType !== 'resume'),
      ...resumeRows(content),
    ];
    const result = await validateRestoredTable(pagedScan(items), TABLE);
    expect(result.problems).toEqual([]);
    expect(result.status).toBe('SUCCESSFUL');
  });

  it('fails a resume with a malformed start month', async () => {
    const content = structuredClone(DEFAULT_RESUME.content);
    content.experience[0]!.start = 'July 2019';
    const items = [
      ...healthyItems().filter((i) => i.entityType !== 'resume'),
      ...resumeRows(content),
    ];
    const result = await validateRestoredTable(pagedScan(items), TABLE);
    expect(result.status).toBe('FAILED');
  });
});
