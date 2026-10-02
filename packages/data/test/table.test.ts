import { describe, expect, it } from 'vitest';
import {
  APP_TABLE,
  LAST_DEPLOYED_GSIS,
  appTableAttributeDefinitions,
  appTableName,
  assertAppTableGsiUpdateSafe,
  assertSafeGsiUpdate,
  tableIndexesFromDescribeTable,
  type TableIndexDefinition,
} from '../src/table.js';
import {
  isPublishRelevant,
  isPublishRelevantAdminMutation,
  PUBLISH_STREAM_SK,
} from '../src/publish-relevance.js';

const gsi4: TableIndexDefinition = {
  indexName: 'gsi4',
  partitionKey: { name: 'gsi4pk', type: 'S' },
  sortKey: { name: 'gsi4sk', type: 'S' },
  projectionType: 'ALL',
};

const gsi5: TableIndexDefinition = {
  indexName: 'gsi5',
  partitionKey: { name: 'gsi5pk', type: 'S' },
  sortKey: { name: 'gsi5sk', type: 'S' },
  projectionType: 'ALL',
};

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

  it('keeps APP_TABLE within one GSI step of LAST_DEPLOYED_GSIS (CHR-174)', () => {
    // LAST_DEPLOYED stays independent of APP_TABLE — do not require equality.
    // A PR may add one index; bump LAST_DEPLOYED only after that deploy.
    expect(() => assertAppTableGsiUpdateSafe(LAST_DEPLOYED_GSIS)).not.toThrow();
  });
});

describe('assertSafeGsiUpdate (CHR-174)', () => {
  it('allows a single GSI create vs last deployed', () => {
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, [
        ...APP_TABLE.globalSecondaryIndexes,
        gsi4,
      ]),
    ).not.toThrow();
  });

  it('fails when two GSIs are created in one update', () => {
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, [
        ...APP_TABLE.globalSecondaryIndexes,
        gsi4,
        gsi5,
      ]),
    ).toThrow(/at most one GSI create or delete/);
  });

  it('fails when removing gsi3 and adding gsi4 in one update', () => {
    const withoutGsi3 = APP_TABLE.globalSecondaryIndexes.filter(
      (g) => g.indexName !== 'gsi3',
    );
    expect(() =>
      assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, [...withoutGsi3, gsi4]),
    ).toThrow(/at most one GSI create or delete/);
  });

  it('fails when an existing GSI key schema changes', () => {
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
      /key schema or projection/,
    );
  });

  it('fails when an existing GSI projection changes', () => {
    const next = APP_TABLE.globalSecondaryIndexes.map((g) =>
      g.indexName === 'gsi3'
        ? { ...g, projectionType: 'KEYS_ONLY' as const }
        : g,
    );
    expect(() => assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, next)).toThrow(
      /key schema or projection/,
    );
  });
});

describe('tableIndexesFromDescribeTable (CHR-174)', () => {
  it('maps DescribeTable GSIs into TableIndexDefinition', () => {
    const indexes = tableIndexesFromDescribeTable({
      AttributeDefinitions: [
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
        { AttributeName: 'syncPk', AttributeType: 'S' },
        { AttributeName: 'syncSk', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'gsi3',
          KeySchema: [
            { AttributeName: 'syncPk', KeyType: 'HASH' },
            { AttributeName: 'syncSk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'KEYS_ONLY' },
        },
      ],
    });
    expect(indexes).toEqual([
      {
        indexName: 'gsi1',
        partitionKey: { name: 'gsi1pk', type: 'S' },
        sortKey: { name: 'gsi1sk', type: 'S' },
        projectionType: 'ALL',
      },
      {
        indexName: 'gsi3',
        partitionKey: { name: 'syncPk', type: 'S' },
        sortKey: { name: 'syncSk', type: 'S' },
        projectionType: 'KEYS_ONLY',
      },
    ]);
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
      isPublishRelevantAdminMutation('POST', '/api/admin/resume/publish'),
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
    // Soft-delete only for targets that set adminSoftDelete (posts).
    expect(isPublishRelevantAdminMutation('DELETE', '/api/admin/home')).toBe(
      false,
    );
  });
});
