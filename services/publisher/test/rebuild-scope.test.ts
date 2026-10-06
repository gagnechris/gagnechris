import { describe, expect, it } from 'vitest';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import {
  collectRebuildScope,
  fullRebuildScope,
  isFullRebuildScope,
  streamNeedsRebuild,
} from '../src/rebuild-scope.js';
import { getPublishTargets } from '../src/publish-targets/registry.js';
import nowPageTarget from './fixtures/now-page.target.js';

const prodTargets = getPublishTargets();

function metaImage(fields: {
  entityType?: string;
  slug?: string;
  status: string;
  pk?: string;
}): Record<string, AttributeValue> {
  const entityType = fields.entityType ?? 'post';
  const image: Record<string, AttributeValue> = {
    pk: {
      S:
        fields.pk ??
        (entityType === 'home'
          ? 'HOME#current'
          : entityType === 'resume'
            ? 'RESUME#current'
            : 'POST#1'),
    },
    sk: { S: 'PUBLISHED' },
    entityType: { S: entityType },
    status: { S: fields.status },
    updatedAt: { S: '2026-09-27T12:00:00.000Z' },
  };
  if (fields.slug !== undefined) {
    image.slug = { S: fields.slug };
  }
  if (entityType === 'post') {
    image.postId = { S: '1' };
    image.title = { S: 'T' };
    image.excerpt = { S: '' };
    image.bodyMarkdown = { S: '' };
  }
  return image;
}

describe('collectRebuildScope', () => {
  it('collects project ids from both the old and new post images', () => {
    const withIds = (ids: string[] | undefined) => {
      const image = metaImage({ slug: 'hello', status: 'published' });
      if (ids) image.projectIds = { L: ids.map((S) => ({ S })) };
      return image;
    };
    const scope = collectRebuildScope([
      {
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: withIds(['A', 'B']),
          NewImage: withIds(['B', 'C']),
        },
      },
      {
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: withIds(undefined),
          NewImage: withIds(undefined),
        },
      },
    ]);
    expect([...scope.projectIds].sort()).toEqual(['A', 'B', 'C']);
  });

  it('ignores project ids on draft-only post changes', () => {
    const image = metaImage({ slug: 'hello', status: 'draft' });
    image.projectIds = { L: [{ S: 'A' }] };
    const scope = collectRebuildScope([
      {
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: { OldImage: image, NewImage: image },
      },
    ]);
    expect(scope.projectIds.size).toBe(0);
  });

  it('ignores unknown PUBLISHED entity types', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: metaImage({
            entityType: 'note',
            slug: 'should-ignore',
            status: 'published',
            pk: 'NOTE#1',
          }),
        },
      },
    ];
    const scope = collectRebuildScope(records);
    expect(scope.feeds).toBe(false);
    expect([...scope.postSlugs]).toEqual([]);
    expect([...scope.touchedEntityTypes]).toEqual(['note']);
    // Unclaimed entity types still skip (no registered target matches).
    expect(streamNeedsRebuild(records, prodTargets)).toBe(false);
  });

  it('rebuilds when a registered target claims the touched entity type', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: metaImage({
            entityType: 'now',
            status: 'published',
            pk: 'NOW#current',
          }),
        },
      },
    ];
    const scope = collectRebuildScope(records);
    expect([...scope.touchedEntityTypes]).toEqual(['now']);
    expect(streamNeedsRebuild(records, prodTargets)).toBe(false);
    expect(streamNeedsRebuild(records, [...prodTargets, nowPageTarget])).toBe(
      true,
    );
  });

  it('does not treat a row without entityType as a post', () => {
    const nonPost: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: {
            pk: { S: 'HOME#current' },
            sk: { S: 'PUBLISHED' },
            status: { S: 'published' },
            updatedAt: { S: '2026-09-27T12:00:00.000Z' },
          },
        },
      },
    ];
    expect(collectRebuildScope(nonPost).feeds).toBe(false);
    expect(streamNeedsRebuild(nonPost, prodTargets)).toBe(false);

    const noEntityType: DynamoDBRecord[] = [
      {
        eventID: '2',
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: {
            pk: { S: 'POST#legacy' },
            sk: { S: 'PUBLISHED' },
            status: { S: 'published' },
            slug: { S: 'legacy-post' },
            postId: { S: 'legacy' },
            title: { S: 'T' },
            excerpt: { S: '' },
            bodyMarkdown: { S: '' },
            updatedAt: { S: '2026-09-27T12:00:00.000Z' },
          },
        },
      },
    ];
    const scope = collectRebuildScope(noEntityType);
    expect(scope.feeds).toBe(false);
    expect(scope.postSlugs.size).toBe(0);
  });

  it('scopes a single post publish to that slug + feeds only', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: metaImage({ slug: 'welcome', status: 'draft' }),
          NewImage: metaImage({ slug: 'welcome', status: 'published' }),
        },
      },
    ];
    const scope = collectRebuildScope(records);
    expect(scope.allPosts).toBe(false);
    expect([...scope.postSlugs]).toEqual(['welcome']);
    expect(scope.feeds).toBe(true);
    expect(scope.home).toBe(false);
    expect(scope.resume).toBe(false);
  });

  it('marks unpublish and rename for cleanup', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: metaImage({ slug: 'old-slug', status: 'published' }),
          NewImage: metaImage({ slug: 'old-slug', status: 'draft' }),
        },
      },
      {
        eventID: '2',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: metaImage({ slug: 'before', status: 'published' }),
          NewImage: metaImage({ slug: 'after', status: 'published' }),
        },
      },
      {
        eventID: '3',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: metaImage({ slug: 'keep', status: 'published' }),
          NewImage: metaImage({ slug: 'keep', status: 'published' }),
        },
      },
    ];

    const scope = collectRebuildScope(records);
    expect([...scope.slugsToRemove].sort()).toEqual(['before', 'old-slug']);
    expect([...scope.postSlugs].sort()).toEqual(['after', 'keep']);
    expect(scope.feeds).toBe(true);
    expect(scope.home).toBe(false);
    expect(scope.resume).toBe(false);
  });

  it('scopes home publish without posts or resume', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: metaImage({
            entityType: 'home',
            status: 'published',
          }),
        },
      },
    ];
    const scope = collectRebuildScope(records);
    expect(scope.home).toBe(true);
    expect(scope.resume).toBe(false);
    expect(scope.feeds).toBe(false);
    expect(scope.postSlugs.size).toBe(0);
  });

  it('scopes resume publish without posts or home', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: metaImage({
            entityType: 'resume',
            status: 'published',
          }),
        },
      },
    ];
    const scope = collectRebuildScope(records);
    expect(scope.resume).toBe(true);
    expect(scope.home).toBe(false);
    expect(scope.feeds).toBe(false);
  });

  it('ignores draft-only home and post edits', () => {
    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          OldImage: metaImage({ slug: 'wip', status: 'draft' }),
          NewImage: metaImage({ slug: 'wip', status: 'draft' }),
        },
      },
      {
        eventID: '2',
        eventName: 'MODIFY',
        eventSource: 'aws:dynamodb',
        dynamodb: {
          NewImage: metaImage({ entityType: 'home', status: 'draft' }),
        },
      },
    ];
    expect(streamNeedsRebuild(records, prodTargets)).toBe(false);
  });
});

describe('isFullRebuildScope', () => {
  it('is true only when all scope flags are set', () => {
    expect(isFullRebuildScope(fullRebuildScope())).toBe(true);
    expect(
      isFullRebuildScope({
        allPosts: false,
        postSlugs: new Set(['welcome']),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
        projectIds: new Set(),
        touchedEntityTypes: new Set(),
      }),
    ).toBe(false);
  });
});
