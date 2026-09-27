import { describe, expect, it } from 'vitest';
import {
  BLOG_SLUG_SYNCED_KEY,
  batchSlugKeyDiff,
  diffBlogSlugKeys,
  KVS_UPDATE_BATCH_SIZE,
} from '../src/viewer-request-slugs.js';

describe('diffBlogSlugKeys', () => {
  it('puts new slugs and the synced sentinel', () => {
    const diff = diffBlogSlugKeys([], ['welcome', 'hello']);
    expect(diff.deletes).toEqual([]);
    expect(diff.puts).toEqual(
      expect.arrayContaining([
        { Key: 'welcome', Value: '1' },
        { Key: 'hello', Value: '1' },
        { Key: BLOG_SLUG_SYNCED_KEY, Value: '1' },
      ]),
    );
    expect(diff.puts).toHaveLength(3);
  });

  it('deletes stale slugs and is a no-op when already synced', () => {
    const existing = ['welcome', 'old-post', BLOG_SLUG_SYNCED_KEY];
    const withStale = diffBlogSlugKeys(existing, ['welcome']);
    expect(withStale.puts).toEqual([]);
    expect(withStale.deletes).toEqual([{ Key: 'old-post' }]);

    const inSync = diffBlogSlugKeys(
      ['welcome', BLOG_SLUG_SYNCED_KEY],
      ['welcome'],
    );
    expect(inSync.puts).toEqual([]);
    expect(inSync.deletes).toEqual([]);
  });

  it('handles 500 published slugs without overflowing a single key', () => {
    const slugs = Array.from({ length: 500 }, (_, i) => `post-${i}`);
    const first = diffBlogSlugKeys([], slugs);
    expect(first.puts).toHaveLength(501); // 500 slugs + sentinel
    expect(first.deletes).toEqual([]);

    const existing = [...slugs, BLOG_SLUG_SYNCED_KEY];
    const noop = diffBlogSlugKeys(existing, slugs);
    expect(noop.puts).toEqual([]);
    expect(noop.deletes).toEqual([]);

    const removeHalf = diffBlogSlugKeys(existing, slugs.slice(0, 250));
    expect(removeHalf.puts).toEqual([]);
    expect(removeHalf.deletes).toHaveLength(250);
  });
});

describe('batchSlugKeyDiff', () => {
  it('chunks puts and deletes into UpdateKeys-sized batches', () => {
    const puts = Array.from({ length: 120 }, (_, i) => ({
      Key: `p-${i}`,
      Value: '1',
    }));
    const deletes = Array.from({ length: 30 }, (_, i) => ({
      Key: `d-${i}`,
    }));
    const batches = batchSlugKeyDiff({ puts, deletes }, KVS_UPDATE_BATCH_SIZE);
    expect(batches).toHaveLength(3);
    expect(
      batches.reduce((n, b) => n + b.puts.length + b.deletes.length, 0),
    ).toBe(150);
    for (const batch of batches) {
      expect(batch.puts.length + batch.deletes.length).toBeLessThanOrEqual(
        KVS_UPDATE_BATCH_SIZE,
      );
    }
  });
});
