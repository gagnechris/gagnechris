/**
 * Single source of DynamoDB key strings (CHR-128).
 * Application code must import builders from here — do not hard-code prefixes.
 */

export const SK_META = 'META';
export const SK_PUBLISHED = 'PUBLISHED';
export const SK_POST = 'POST';
export const SK_REDIRECT = 'REDIRECT';
export const SK_MSG = 'MSG';

export const GSI1_NAME = 'gsi1';
export const GSI2_NAME = 'gsi2';
/** Sparse sync feed index (CHR-153): META items with syncPk/syncSk. */
export const GSI3_NAME = 'gsi3';

export const HOME_ID = 'current';
export const RESUME_ID = 'current';

/** Post entity keys only — never NOTE# / TASK# (reserved for Notebook). */
export function postPk(postId: string): string {
  return `POST#${postId}`;
}

export function postMetaSk(): string {
  return SK_META;
}

export function postPublishedSk(): string {
  return SK_PUBLISHED;
}

export function slugPk(slug: string): string {
  return `SLUG#${slug}`;
}

export function slugPostSk(): string {
  return SK_POST;
}

export function slugRedirectSk(): string {
  return SK_REDIRECT;
}

export function tagPk(tag: string): string {
  return `TAG#${tag}`;
}

export function tagSk(publishedAt: string, postId: string): string {
  return `TS#${publishedAt}#POST#${postId}`;
}

export function statusGsi1Pk(status: string): string {
  return `STATUS#${status}`;
}

export function statusGsi1Sk(sortTs: string, postId: string): string {
  return `TS#${sortTs}#POST#${postId}`;
}

export function homePk(): string {
  return `HOME#${HOME_ID}`;
}

export function homeMetaSk(): string {
  return SK_META;
}

export function homePublishedSk(): string {
  return SK_PUBLISHED;
}

export function resumePk(): string {
  return `RESUME#${RESUME_ID}`;
}

export function resumeMetaSk(): string {
  return SK_META;
}

export function resumePublishedSk(): string {
  return SK_PUBLISHED;
}

export function contactPk(contactId: string): string {
  return `CONTACT#${contactId}`;
}

export function contactMsgSk(): string {
  return SK_MSG;
}

export function rateContactIpPk(ip: string): string {
  return `RATE#contact#ip#${ip}`;
}

export function rateResumeIpPk(ip: string): string {
  return `RATE#resume#ip#${ip}`;
}

export function rateSesGlobalPk(): string {
  return 'RATE#ses#global';
}

/** UTC hour bucket: `HOUR#2026-09-27T14` */
export function rateHourSk(at: Date = new Date()): string {
  const iso = at.toISOString();
  return `HOUR#${iso.slice(0, 13)}`;
}

/** UTC day bucket: `DAY#2026-09-27` */
export function rateDaySk(at: Date = new Date()): string {
  return `DAY#${at.toISOString().slice(0, 10)}`;
}

/** Seconds until end of current UTC hour (+1h buffer for clock skew). */
export function ttlEndOfUtcHour(at: Date = new Date()): number {
  const end = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate(),
    at.getUTCHours() + 1,
    0,
    0,
    0,
  );
  return Math.floor(end / 1000) + 3600;
}

/** Seconds until end of current UTC day (+1d buffer). */
export function ttlEndOfUtcDay(at: Date = new Date()): number {
  const end = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.floor(end / 1000) + 86_400;
}

/** Tombstone TTL for soft-deleted sync entities (CHR-141), default 30 days. */
export const SYNC_TOMBSTONE_TTL_DAYS = 30;

export function ttlDaysFromNow(
  days: number = SYNC_TOMBSTONE_TTL_DAYS,
  at: Date = new Date(),
): number {
  return Math.floor(at.getTime() / 1000) + days * 86_400;
}

/** Fixture entity for sync-pattern spike (CHR-141) — not Notebook NOTE#. */
export function fixturePk(fixtureId: string): string {
  return `FIXTURE#${fixtureId}`;
}

export function fixtureMetaSk(): string {
  return SK_META;
}

/**
 * Sparse GSI partition for a user's sync feed (CHR-153).
 * Written on the entity META item (not a separate ledger row).
 */
export function syncPk(userId: string): string {
  return `SYNC#${userId}`;
}

/**
 * Normalize a client `since` / watermark to UTC ISO-8601 with milliseconds.
 * Avoids lexicographic bugs when clients omit ms or send an offset.
 */
export function normalizeSyncSince(since: string): string {
  const ms = Date.parse(since);
  if (Number.isNaN(ms)) {
    throw new SyntaxError(`Invalid sync since timestamp: ${since}`);
  }
  return new Date(ms).toISOString();
}

/** Overlap window re-queried on each poll so late-committed writes are not skipped. */
export const SYNC_OVERLAP_MS = 5_000;

/**
 * Sync GSI sort key — lexicographic order ≈ time order when `updatedAt` is ISO-8601.
 * Example: `2026-09-28T22:00:00.000Z#FIXTURE#01ABC…`
 */
export function syncSk(
  updatedAt: string,
  entityType: string,
  entityId: string,
): string {
  const ts = normalizeSyncSince(updatedAt);
  return `${ts}#${entityType.toUpperCase()}#${entityId}`;
}

/** Lower bound for a sync GSI query, applying the overlap window when `since` is set. */
export function syncSinceLowerBound(
  since: string | undefined,
): string | undefined {
  if (!since) return undefined;
  const normalized = normalizeSyncSince(since);
  return new Date(Date.parse(normalized) - SYNC_OVERLAP_MS).toISOString();
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Structured accessors used by publisher/API (CHR-128). */
export const keys = {
  post: {
    meta: (id: string) => ({ pk: postPk(id), sk: postMetaSk() }),
    published: (id: string) => ({ pk: postPk(id), sk: postPublishedSk() }),
  },
  singleton: {
    home: {
      meta: () => ({ pk: homePk(), sk: homeMetaSk() }),
      published: () => ({ pk: homePk(), sk: homePublishedSk() }),
    },
    resume: {
      meta: () => ({ pk: resumePk(), sk: resumeMetaSk() }),
      published: () => ({ pk: resumePk(), sk: resumePublishedSk() }),
    },
  },
  fixture: {
    meta: (id: string) => ({ pk: fixturePk(id), sk: fixtureMetaSk() }),
  },
  sync: {
    pk: (userId: string) => syncPk(userId),
    sk: (updatedAt: string, entityType: string, entityId: string) =>
      syncSk(updatedAt, entityType, entityId),
  },
  status: (status: string) => statusGsi1Pk(status),
} as const;
