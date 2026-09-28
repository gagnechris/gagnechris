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
  status: (status: string) => statusGsi1Pk(status),
} as const;
