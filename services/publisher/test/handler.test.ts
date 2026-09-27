import { describe, expect, it } from 'vitest';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import { collectSlugsToRemove } from '../src/handler.js';

function metaImage(fields: {
  slug: string;
  status: string;
}): Record<string, AttributeValue> {
  return {
    pk: { S: 'POST#1' },
    sk: { S: 'META' },
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

describe('collectSlugsToRemove', () => {
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

    expect([...collectSlugsToRemove(records)].sort()).toEqual([
      'before',
      'old-slug',
    ]);
  });
});
