import { describe, expect, it } from 'vitest';
import { metaToPost, parsePostMetaItem } from '../src/items.js';

const stored = {
  pk: 'POST#01POST',
  sk: 'PUBLISHED',
  entityType: 'post',
  postId: '01POST',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: '',
  tags: [],
  status: 'published',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  version: 1,
};

describe('post items', () => {
  it('a row stored without projectIds parses with none', () => {
    expect(metaToPost(parsePostMetaItem(stored)).projectIds).toEqual([]);
  });

  it('keeps stored projectIds', () => {
    expect(
      metaToPost(parsePostMetaItem({ ...stored, projectIds: ['01PROJECT'] }))
        .projectIds,
    ).toEqual(['01PROJECT']);
  });
});
