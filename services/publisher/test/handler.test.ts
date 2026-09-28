import { describe, expect, it } from 'vitest';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import {
  collectRebuildScope,
  streamNeedsRebuild,
} from '../src/rebuild-scope.js';

function metaImage(fields: {
  slug: string;
  status: string;
}): Record<string, AttributeValue> {
  return {
    pk: { S: 'POST#1' },
    sk: { S: 'PUBLISHED' },
    entityType: { S: 'post' },
    postId: { S: '1' },
    slug: { S: fields.slug },
    status: { S: fields.status },
    title: { S: 'T' },
    excerpt: { S: '' },
    bodyMarkdown: { S: '' },
    updatedAt: { S: '2026-09-27T12:00:00.000Z' },
  };
}

describe('collectRebuildScope (handler stream path)', () => {
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
  });
});

describe('streamNeedsRebuild', () => {
  it('rebuilds on PUBLISHED changes only', () => {
    const publishedChange: DynamoDBRecord = {
      eventID: '1',
      eventName: 'MODIFY',
      eventSource: 'aws:dynamodb',
      dynamodb: {
        OldImage: metaImage({ slug: 'a', status: 'published' }),
        NewImage: metaImage({ slug: 'a', status: 'published' }),
      },
    };
    expect(streamNeedsRebuild([publishedChange])).toBe(true);
  });

  it('ignores META draft edits', () => {
    const metaDraft = (fields: {
      slug: string;
      status: string;
    }): Record<string, AttributeValue> => ({
      ...metaImage(fields),
      sk: { S: 'META' },
    });
    const draftEdit: DynamoDBRecord = {
      eventID: '1',
      eventName: 'MODIFY',
      eventSource: 'aws:dynamodb',
      dynamodb: {
        OldImage: metaDraft({ slug: 'a', status: 'draft' }),
        NewImage: metaDraft({ slug: 'a', status: 'draft' }),
      },
    };
    expect(streamNeedsRebuild([draftEdit])).toBe(false);
  });
});
