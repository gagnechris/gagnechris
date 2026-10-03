import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_LENGTH,
  checkItem,
  isRestoreTestTableName,
  tableNameFromArn,
  validateRestoredTable,
} from '../src/validate.js';
import { healthyItems, pagedScan } from './fixtures.js';

const TABLE = 'awsbackup-restore-test-abc123';

describe('validateRestoredTable (CHR-198)', () => {
  it('passes a healthy restore across scan pages', async () => {
    const scan = pagedScan(healthyItems(), 2);
    const result = await validateRestoredTable(scan, TABLE);
    expect(result.status).toBe('SUCCESSFUL');
    expect(result.itemCount).toBe(7);
    // home, resume, note, task, daily claim
    expect(result.schemaChecked).toBe(5);
    expect(result.problems).toEqual([]);
    expect(scan.calls).toBe(4);
    expect(result.message).toMatch(/^OK: 7 items/);
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

describe('helpers', () => {
  it('checkItem flags missing keys', () => {
    expect(checkItem({ sk: 'META' })).toBe('item without a string pk');
    expect(checkItem({ pk: 'A' })).toBe('A: missing string sk');
    expect(checkItem({ pk: 'A', sk: 'B', entityType: 'unknown' })).toBe(
      undefined,
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
