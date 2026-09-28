import { describe, expect, it } from 'vitest';
import {
  APP_TABLE,
  appTableAttributeDefinitions,
  appTableName,
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
