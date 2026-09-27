import { describe, expect, it } from 'vitest';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import {
  buildInvalidationPaths,
  collectRebuildScope,
  fullRebuildScope,
  streamNeedsRebuild,
} from '../src/rebuild-scope.js';

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
    expect(streamNeedsRebuild(records)).toBe(false);
  });
});

describe('buildInvalidationPaths', () => {
  it('uses /* for full rebuild', () => {
    expect(
      buildInvalidationPaths({
        scope: fullRebuildScope(),
        changedKeys: ['blog/a/index.html'],
        removedSlugs: [],
      }),
    ).toEqual(['/*']);
  });

  it('keeps a single-post publish at ≤5 wildcard paths', () => {
    const paths = buildInvalidationPaths({
      scope: {
        allPosts: false,
        postSlugs: new Set(['welcome']),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
      },
      changedKeys: [
        'blog/welcome/index.html',
        'blog/index.html',
        'blog/posts.json',
        'blog/slugs.json',
        'sitemap.xml',
        'rss.xml',
      ],
      removedSlugs: [],
    });
    expect(paths.length).toBeLessThanOrEqual(5);
    expect(paths).toEqual(
      expect.arrayContaining(['/blog*', '/sitemap.xml', '/rss.xml']),
    );
    expect(paths).toHaveLength(3);
  });

  it('invalidates only home paths when index.html changed', () => {
    expect(
      buildInvalidationPaths({
        scope: {
          allPosts: false,
          postSlugs: new Set(),
          slugsToRemove: new Set(),
          feeds: false,
          home: true,
          resume: false,
        },
        changedKeys: ['index.html'],
        removedSlugs: [],
      }).sort(),
    ).toEqual(['/', '/index.html']);
  });

  it('invalidates resume* when resume artifacts changed', () => {
    expect(
      buildInvalidationPaths({
        scope: {
          allPosts: false,
          postSlugs: new Set(),
          slugsToRemove: new Set(),
          feeds: false,
          home: false,
          resume: true,
        },
        changedKeys: ['resume/index.html', 'resume.pdf'],
        removedSlugs: [],
      }),
    ).toEqual(['/resume*']);
  });

  it('skips invalidation when hash-skip left nothing changed', () => {
    expect(
      buildInvalidationPaths({
        scope: {
          allPosts: false,
          postSlugs: new Set(['welcome']),
          slugsToRemove: new Set(),
          feeds: true,
          home: false,
          resume: false,
        },
        changedKeys: [],
        removedSlugs: [],
      }),
    ).toEqual([]);
  });
});
