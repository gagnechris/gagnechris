import { describe, expect, it } from 'vitest';
import {
  APP_TABLE,
  LAST_DEPLOYED_GSI_NAMES,
  appTableAttributeDefinitions,
  appTableName,
  assertSafeGsiUpdate,
} from '../src/table.js';
import {
  isPublishRelevant,
  isPublishRelevantAdminMutation,
  PUBLISH_STREAM_SK,
} from '../src/publish-relevance.js';

describe('APP_TABLE', () => {
  it('names env tables consistently', () => {
    expect(appTableName('prod')).toBe('gagnechris-prod');
    expect(appTableName('local')).toBe('gagnechris-local');
  });

  it('lists pk/sk and all GSI key attributes once', () => {
    const attrs = appTableAttributeDefinitions();
    expect(attrs.map((a) => a.AttributeName).sort()).toEqual([
      'gsi1pk',
      'gsi1sk',
      'gsi2pk',
      'gsi2sk',
      'pk',
      'sk',
      'syncPk',
      'syncSk',
    ]);
    expect(APP_TABLE.globalSecondaryIndexes.map((g) => g.indexName)).toEqual([
      'gsi1',
      'gsi2',
      'gsi3',
    ]);
  });

  it('allows at most one GSI create or delete vs last deployed (CHR-155)', () => {
    // APP_TABLE may be exactly one GSI ahead of LAST_DEPLOYED while a create
    // is pending deploy; bump LAST_DEPLOYED after that deploy succeeds.
    assertSafeGsiUpdate(
      LAST_DEPLOYED_GSI_NAMES,
      APP_TABLE.globalSecondaryIndexes,
    );
    const current = APP_TABLE.globalSecondaryIndexes.map((g) => g.indexName);
    const prev = new Set<string>(LAST_DEPLOYED_GSI_NAMES);
    const added = current.filter((n) => !prev.has(n));
    const removed = [...prev].filter((n) => !current.includes(n));
    expect(added.length + removed.length).toBeLessThanOrEqual(1);

    const gsi4 = {
      indexName: 'gsi4',
      partitionKey: { name: 'gsi4pk', type: 'S' as const },
      sortKey: { name: 'gsi4sk', type: 'S' as const },
      projectionType: 'ALL' as const,
    };
    const gsi5 = {
      indexName: 'gsi5',
      partitionKey: { name: 'gsi5pk', type: 'S' as const },
      sortKey: { name: 'gsi5sk', type: 'S' as const },
      projectionType: 'ALL' as const,
    };
    // One additional create beyond current APP_TABLE is still safe vs last deployed
    // only when APP_TABLE is already in sync — here APP_TABLE is one ahead, so
    // adding another must fail.
    if (added.length === 0) {
      assertSafeGsiUpdate(LAST_DEPLOYED_GSI_NAMES, [
        ...APP_TABLE.globalSecondaryIndexes,
        gsi4,
      ]);
    }
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSI_NAMES, [
        ...APP_TABLE.globalSecondaryIndexes,
        gsi4,
        gsi5,
      ]),
    ).toThrow(/at most one GSI create or delete/);
  });
});

describe('isPublishRelevant', () => {
  it('matches the publisher stream sk filter', () => {
    expect(PUBLISH_STREAM_SK).toBe('PUBLISHED');
    expect(isPublishRelevant({ sk: { S: 'PUBLISHED' } })).toBe(true);
    expect(isPublishRelevant({ sk: { S: 'META' } })).toBe(false);
    expect(isPublishRelevant(undefined)).toBe(false);
  });
});

describe('isPublishRelevantAdminMutation', () => {
  it('flags publish/unpublish/delete admin routes', () => {
    expect(
      isPublishRelevantAdminMutation('POST', '/api/admin/posts/abc/publish'),
    ).toBe(true);
    expect(
      isPublishRelevantAdminMutation('POST', '/api/admin/home/unpublish'),
    ).toBe(true);
    expect(
      isPublishRelevantAdminMutation('DELETE', '/api/admin/posts/abc'),
    ).toBe(true);
    expect(isPublishRelevantAdminMutation('GET', '/api/admin/posts')).toBe(
      false,
    );
    expect(isPublishRelevantAdminMutation('PUT', '/api/admin/posts/abc')).toBe(
      false,
    );
  });
});
