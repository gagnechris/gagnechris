import { describe, expect, it, vi } from 'vitest';
import {
  BLOG_SLUG_SYNCED_KEY,
  batchSlugKeyDiff,
  diffBlogSlugKeys,
  KVS_UPDATE_BATCH_SIZE,
  KvsSyncError,
  syncBlogSlugsOnce,
  syncBlogSlugsWithClient,
  type BlogSlugKvsClient,
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

describe('syncBlogSlugsOnce / concurrent sync (CHR-119)', () => {
  function createInMemoryKvs(initialKeys: string[] = []) {
    let etag = 'etag-1';
    const keys = new Set(initialKeys);

    const client: BlogSlugKvsClient = {
      async describeETag() {
        return etag;
      },
      async listKeys() {
        return [...keys];
      },
      async updateKeys({ ifMatch, puts, deletes }) {
        if (ifMatch !== etag) {
          const err = new Error('Precondition failed');
          err.name = 'ConflictException';
          throw err;
        }
        for (const d of deletes) {
          if (d.Key) keys.delete(d.Key);
        }
        for (const p of puts) {
          if (p.Key) keys.add(p.Key);
        }
        etag = `etag-${Number(etag.replace('etag-', '')) + 1}`;
        return etag;
      },
    };

    return {
      client,
      getKeys: () => new Set(keys),
      bumpEtag: () => {
        etag = `etag-${Number(etag.replace('etag-', '')) + 1}`;
      },
    };
  }

  it('describe → list → update uses the pre-list ETag', async () => {
    const store = createInMemoryKvs([]);
    const order: string[] = [];
    const wrapped: BlogSlugKvsClient = {
      async describeETag(arn) {
        order.push('describe');
        return store.client.describeETag(arn);
      },
      async listKeys(arn) {
        order.push('list');
        return store.client.listKeys(arn);
      },
      async updateKeys(input) {
        order.push('update');
        return store.client.updateKeys(input);
      },
    };
    await syncBlogSlugsOnce('arn:test', ['welcome'], wrapped);
    expect(order).toEqual(['describe', 'list', 'update']);
    expect(store.getKeys()).toEqual(
      new Set(['welcome', BLOG_SLUG_SYNCED_KEY]),
    );
  });

  it('concurrent syncs converge via ConflictException retry', async () => {
    // Simulate the race: sync A describes+lists, then sync B mutates the
    // store (new ETag) before A updates → A conflicts, retries, converges.
    const store = createInMemoryKvs([BLOG_SLUG_SYNCED_KEY, 'old']);
    let described = false;
    const client: BlogSlugKvsClient = {
      async describeETag(arn) {
        return store.client.describeETag(arn);
      },
      async listKeys(arn) {
        const listed = await store.client.listKeys(arn);
        if (!described) {
          described = true;
          // Interleave: another sync wins first with a different desired set.
          await syncBlogSlugsOnce('arn:test', ['a', 'b'], store.client);
        }
        return listed;
      },
      updateKeys: (input) => store.client.updateKeys(input),
    };

    const sleep = vi.fn().mockResolvedValue(undefined);
    await syncBlogSlugsWithClient('arn:test', ['a'], {
      client,
      sleep,
    });

    expect(store.getKeys()).toEqual(new Set(['a', BLOG_SLUG_SYNCED_KEY]));
    expect(sleep).toHaveBeenCalled();
  });

  it('retries then throws KvsSyncError when every attempt fails', async () => {
    const client: BlogSlugKvsClient = {
      describeETag: async () => {
        throw new Error('boom');
      },
      listKeys: async () => [],
      updateKeys: async () => 'x',
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      syncBlogSlugsWithClient('arn:test', ['welcome'], {
        client,
        maxAttempts: 3,
        sleep,
      }),
    ).rejects.toBeInstanceOf(KvsSyncError);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
