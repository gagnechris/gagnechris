import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  CopyBackRefusedError,
  applyCopyBack,
  assertCopyBackTables,
  planCopyBack,
} from '../src/restore/copy-back.js';

describe('copy-back table guard', () => {
  it('allows scratch → prod and scratch → local', () => {
    expect(() =>
      assertCopyBackTables('gagnechris-prod-restore-1', 'gagnechris-prod'),
    ).not.toThrow();
    expect(() =>
      assertCopyBackTables('gagnechris-local-restore-1', 'gagnechris-local'),
    ).not.toThrow();
  });

  it.each([
    ['gagnechris-prod', 'gagnechris-prod', /same table/],
    ['gagnechris-prod-restore-1', 'gagnechris-staging', /target must be/],
    ['gagnechris-prod-restore-1', 'awsbackup-restore-test-x', /target must be/],
    ['gagnechris-local', 'gagnechris-prod', /live table/],
    ['', 'gagnechris-prod', /required/],
  ])('refuses %s → %s', (source, target, message) => {
    expect(() => assertCopyBackTables(source, target)).toThrow(message);
    expect(() => assertCopyBackTables(source, target)).toThrow(
      CopyBackRefusedError,
    );
  });

  it('refuses before any DynamoDB call', async () => {
    const send = vi.fn();
    const doc = { send } as unknown as DynamoDBDocumentClient;
    const bad = {
      sourceTable: 'gagnechris-prod-restore-1',
      targetTable: 'some-other-table',
      userId: 'u',
    };
    await expect(planCopyBack(doc, bad)).rejects.toThrow(CopyBackRefusedError);
    await expect(applyCopyBack(doc, bad, [])).rejects.toThrow(
      CopyBackRefusedError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
