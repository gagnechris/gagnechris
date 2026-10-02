import { describe, expect, it } from 'vitest';
import {
  APP_TABLE,
  LAST_DEPLOYED_GSI_NAMES,
  LAST_DEPLOYED_GSIS,
  appTableAttributeDefinitions,
  appTableName,
  assertSafeGsiUpdate,
  type TableIndexDefinition,
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

  it('keeps LAST_DEPLOYED_GSIS in strict equality with APP_TABLE (CHR-163)', () => {
    expect(LAST_DEPLOYED_GSI_NAMES).toEqual(
      APP_TABLE.globalSecondaryIndexes.map((g) => g.indexName),
    );
    assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, APP_TABLE.globalSecondaryIndexes);
    expect(LAST_DEPLOYED_GSIS).toEqual(APP_TABLE.globalSecondaryIndexes);
  });

  it('allows a single GSI create vs last deployed', () => {
    const gsi4: TableIndexDefinition = {
      indexName: 'gsi4',
      partitionKey: { name: 'gsi4pk', type: 'S' },
      sortKey: { name: 'gsi4sk', type: 'S' },
      projectionType: 'ALL',
    };
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, [
        ...APP_TABLE.globalSecondaryIndexes,
        gsi4,
      ]),
    ).not.toThrow();
  });

  it('fails when removing gsi3 and adding gsi4 in one update (CHR-163)', () => {
    const withoutGsi3 = APP_TABLE.globalSecondaryIndexes.filter(
      (g) => g.indexName !== 'gsi3',
    );
    const gsi4: TableIndexDefinition = {
      indexName: 'gsi4',
      partitionKey: { name: 'gsi4pk', type: 'S' },
      sortKey: { name: 'gsi4sk', type: 'S' },
      projectionType: 'ALL',
    };
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, [...withoutGsi3, gsi4]),
    ).toThrow(/at most one GSI create or delete/);
  });

  it('fails when an existing GSI key schema changes (CHR-163)', () => {
    const next = APP_TABLE.globalSecondaryIndexes.map((g) =>
      g.indexName === 'gsi3'
        ? {
            ...g,
            partitionKey: { name: 'syncPk2', type: 'S' as const },
            sortKey: { name: 'syncSk2', type: 'S' as const },
          }
        : g,
    );
    expect(() => assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, next)).toThrow(
      /key schema/,
    );
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
