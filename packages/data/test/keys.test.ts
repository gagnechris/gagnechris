import { describe, expect, it } from 'vitest';
import {
  API_LAMBDA_TIMEOUT_MS,
  keys,
  parsePostMetaItem,
  postPk,
  SK_META,
  SK_PUBLISHED,
  slugify,
  statusGsi1Pk,
  syncCreateClaimPk,
  syncSk,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  SYNC_OVERLAP_MS,
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

  it('builds sync GSI and create-claim keys (CHR-153 / CHR-162)', () => {
    expect(syncSk('2026-09-28T12:00:00.000Z', 'note', 'n1')).toBe(
      '2026-09-28T12:00:00.000Z#NOTE#n1',
    );
    expect(keys.sync.sk('2026-09-28T12:00:00.000Z', 'note', 'n1')).toBe(
      '2026-09-28T12:00:00.000Z#NOTE#n1',
    );
    // Offset / no-ms normalize to the same UTC-ms key prefix.
    expect(syncSk('2026-09-28T12:00:00Z', 'note', 'n1')).toBe(
      syncSk('2026-09-28T12:00:00.000Z', 'note', 'n1'),
    );
    expect(syncSk('2026-09-28T17:00:00.000+05:00', 'note', 'n1')).toBe(
      syncSk('2026-09-28T12:00:00.000Z', 'note', 'n1'),
    );
    expect(syncCreateClaimPk('fakeNote', '01ABC')).toBe(
      'CREATED#FAKENOTE#01ABC',
    );
    expect(keys.sync.createClaim('fakeNote', '01ABC')).toEqual({
      pk: 'CREATED#FAKENOTE#01ABC',
      sk: SK_META,
    });
  });

  it('sync overlap is at least the API Lambda timeout (CHR-162)', () => {
    expect(SYNC_OVERLAP_MS).toBeGreaterThanOrEqual(API_LAMBDA_TIMEOUT_MS);
    expect(SYNC_CREATE_CLAIM_TTL_DAYS).toBeGreaterThan(SYNC_TOMBSTONE_TTL_DAYS);
  });

  it('ttlDaysFromNow defaults to SYNC_TOMBSTONE_TTL_DAYS', () => {
    const at = new Date('2026-09-28T12:00:00.000Z');
    const ttl = ttlDaysFromNow(undefined, at);
    expect(ttl).toBe(
      Math.floor(at.getTime() / 1000) + SYNC_TOMBSTONE_TTL_DAYS * 86_400,
    );
  });
});
