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

  it('lists pk/sk and both GSI key attributes once', () => {
    const attrs = appTableAttributeDefinitions();
    expect(attrs.map((a) => a.AttributeName).sort()).toEqual([
      'gsi1pk',
      'gsi1sk',
      'gsi2pk',
      'gsi2sk',
      'pk',
      'sk',
    ]);
    expect(APP_TABLE.globalSecondaryIndexes.map((g) => g.indexName)).toEqual([
      'gsi1',
      'gsi2',
    ]);
  });

  it('allows at most one GSI create or delete vs last deployed (CHR-155)', () => {
    expect([...LAST_DEPLOYED_GSI_NAMES]).toEqual(
      APP_TABLE.globalSecondaryIndexes.map((g) => g.indexName),
    );
    assertSafeGsiUpdate(
      LAST_DEPLOYED_GSI_NAMES,
      APP_TABLE.globalSecondaryIndexes,
    );
    const gsi3 = {
      indexName: 'gsi3',
      partitionKey: { name: 'gsi3pk', type: 'S' as const },
      sortKey: { name: 'gsi3sk', type: 'S' as const },
      projectionType: 'ALL' as const,
    };
    const gsi4 = {
      indexName: 'gsi4',
      partitionKey: { name: 'gsi4pk', type: 'S' as const },
      sortKey: { name: 'gsi4sk', type: 'S' as const },
      projectionType: 'ALL' as const,
    };
    assertSafeGsiUpdate(LAST_DEPLOYED_GSI_NAMES, [
      ...APP_TABLE.globalSecondaryIndexes,
      gsi3,
    ]);
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSI_NAMES, [
        ...APP_TABLE.globalSecondaryIndexes,
        gsi3,
        gsi4,
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
