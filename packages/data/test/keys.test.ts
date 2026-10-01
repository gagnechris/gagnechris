import { describe, expect, it } from 'vitest';
import {
  fixturePk,
  keys,
  parsePostMetaItem,
  postPk,
  SK_META,
  SK_PUBLISHED,
  slugify,
  statusGsi1Pk,
  syncSk,
  SYNC_TOMBSTONE_TTL_DAYS,
  ttlDaysFromNow,
} from '../src/index.js';

describe('@gagnechris/data keys', () => {
  it('builds typed post keys without callers hard-coding prefixes', () => {
    expect(postPk('01ABC')).toBe('POST#01ABC');
    expect(keys.post.meta('01ABC')).toEqual({
      pk: 'POST#01ABC',
      sk: SK_META,
    });
    expect(keys.post.published('01ABC')).toEqual({
      pk: 'POST#01ABC',
      sk: SK_PUBLISHED,
    });
    expect(keys.singleton.home.published()).toEqual({
      pk: 'HOME#current',
      sk: SK_PUBLISHED,
    });
    expect(statusGsi1Pk('published')).toBe('STATUS#published');
  });

  it('slugify matches shared NFKD rules with untitled fallback', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Café  ')).toBe('cafe');
    expect(slugify('  ')).toBe('untitled');
  });

  it('parsePostMetaItem rejects invalid items', () => {
    expect(() => parsePostMetaItem({ entityType: 'post' })).toThrow();
  });

  it('builds fixture and sync GSI keys (CHR-141 / CHR-153)', () => {
    expect(fixturePk('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(
      'FIXTURE#01ARZ3NDEKTSV4RRFFQ69G5FAV',
    );
    expect(keys.fixture.meta('01ABC')).toEqual({
      pk: 'FIXTURE#01ABC',
      sk: SK_META,
    });
    expect(syncSk('2026-09-28T12:00:00.000Z', 'fixture', '01ABC')).toBe(
      '2026-09-28T12:00:00.000Z#FIXTURE#01ABC',
    );
    expect(keys.sync.sk('2026-09-28T12:00:00.000Z', 'note', 'n1')).toBe(
      '2026-09-28T12:00:00.000Z#NOTE#n1',
    );
    // Offset / no-ms normalize to the same UTC-ms key prefix.
    expect(syncSk('2026-09-28T12:00:00Z', 'fixture', '01ABC')).toBe(
      syncSk('2026-09-28T12:00:00.000Z', 'fixture', '01ABC'),
    );
    expect(syncSk('2026-09-28T17:00:00.000+05:00', 'fixture', '01ABC')).toBe(
      syncSk('2026-09-28T12:00:00.000Z', 'fixture', '01ABC'),
    );
  });

  it('ttlDaysFromNow defaults to SYNC_TOMBSTONE_TTL_DAYS', () => {
    const at = new Date('2026-09-28T12:00:00.000Z');
    const ttl = ttlDaysFromNow(undefined, at);
    expect(ttl).toBe(
      Math.floor(at.getTime() / 1000) + SYNC_TOMBSTONE_TTL_DAYS * 86_400,
    );
  });
});
