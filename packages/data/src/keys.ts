/**
 * Application code must import builders from here; do not hard-code prefixes.
 * Each key string has one builder function; an item key (`{ pk, sk }`) comes
 * only from `keys`.
 */

import type { NotebookArea } from '@gagnechris/shared';

export type { NotebookArea };

export const SK_META = 'META';
export const SK_PUBLISHED = 'PUBLISHED';
export const SK_POST = 'POST';
export const SK_REDIRECT = 'REDIRECT';
export const SK_MSG = 'MSG';
export const SK_NOTE = 'NOTE';
export const SK_PROJECT = 'PROJECT';

export const GSI1_NAME = 'gsi1';
export const GSI2_NAME = 'gsi2';
export const GSI3_NAME = 'gsi3';

export const HOME_ID = 'current';
export const RESUME_ID = 'current';

/** Never NOTE# / TASK#: those are reserved for Notebook. */
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

export function projectPk(projectId: string): string {
  return `PROJECT#${projectId}`;
}

/** Own partition so posts' slug and redirect rows never collide with a project's. */
export function projectSlugPk(slug: string): string {
  return `PROJECT_SLUG#${slug}`;
}

export function projectSlugClaimSk(): string {
  return SK_PROJECT;
}

/** Separate from posts' `STATUS#…` so the published-posts query never sees projects. */
export function projectStatusGsi1Pk(status: string): string {
  return `PROJECT_STATUS#${status}`;
}

export function projectOrderGsi1Sk(order: number, projectId: string): string {
  return `ORDER#${String(order).padStart(6, '0')}#PROJECT#${projectId}`;
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

/** One partition: removed users are few and always listed together. */
export function removedUsersPk(): string {
  return 'REMOVED_USERS';
}

export function removedUserSk(userId: string): string {
  return `USER#${userId}`;
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

export function rateHourSk(at: Date = new Date()): string {
  const iso = at.toISOString();
  return `HOUR#${iso.slice(0, 13)}`;
}

export function rateDaySk(at: Date = new Date()): string {
  return `DAY#${at.toISOString().slice(0, 10)}`;
}

/** +1h buffer for clock skew. */
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

export const SYNC_TOMBSTONE_TTL_DAYS = 30;

/** Longer than the tombstone TTL so an offline create replay cannot resurrect a purged row. */
export const SYNC_CREATE_CLAIM_TTL_DAYS = 365;

/** Covers clock skew between the TTL stamp and `updatedAt`, and TTL granularity. */
export const SYNC_RESYNC_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * A tombstone stamped at `t` may be purged from `t + TTL`, so every change the
 * client still needs (`updatedAt ≥ since − SYNC_OVERLAP_MS`) is only
 * guaranteed present while `since − overlap ≥ now − TTL + margin`. Adding
 * (not subtracting) the margin is what keeps deletes from being missed.
 */
export function syncResyncHorizonIso(at: Date = new Date()): string {
  const ms =
    at.getTime() -
    SYNC_TOMBSTONE_TTL_DAYS * 86_400_000 +
    SYNC_RESYNC_MARGIN_MS +
    SYNC_OVERLAP_MS;
  return new Date(ms).toISOString();
}

export function ttlDaysFromNow(
  days: number = SYNC_TOMBSTONE_TTL_DAYS,
  at: Date = new Date(),
): number {
  return Math.floor(at.getTime() / 1000) + days * 86_400;
}

/** Written on the entity META item, not a separate ledger row. */
export function syncPk(userId: string): string {
  return `SYNC#${userId}`;
}

/** Durable so client-ULID ids cannot resurrect after the tombstone TTL. */
export function syncCreateClaimPk(
  changeType: string,
  entityId: string,
): string {
  return `CREATED#${changeType.toUpperCase()}#${entityId}`;
}

/** Includes Cognito `sub` so two users never share a claim even if ULIDs collide. */
export function ownerSyncCreateClaimPk(
  userId: string,
  changeType: string,
  entityId: string,
): string {
  return `CREATED#${changeType.toUpperCase()}#USER#${userId}#${entityId}`;
}

export function syncCreateClaimSk(): string {
  return SK_META;
}

export function notePk(userId: string, noteId: string): string {
  return `USER#${userId}#NOTE#${noteId}`;
}

export function noteMetaSk(): string {
  return SK_META;
}

/** Stores `noteId` so a losing create can resolve to the winner. */
export function dailyNoteClaimPk(
  userId: string,
  area: NotebookArea | string,
  date: string,
): string {
  return `USER#${userId}#DAILY#${area}#${date}`;
}

export function dailyNoteClaimSk(): string {
  return SK_NOTE;
}

export function taskPk(userId: string, taskId: string): string {
  return `USER#${userId}#TASK#${taskId}`;
}

export function taskMetaSk(): string {
  return SK_META;
}

/** Namespaced by user so Notebook never shares post `STATUS#*` partitions. */
export function notebookAreaGsi1Pk(
  userId: string,
  area: NotebookArea | string,
): string {
  return `USER#${userId}#AREA#${area}`;
}

export function noteDateGsi1Sk(noteDate: string, noteId: string): string {
  return `DATE#${noteDate}#NOTE#${noteId}`;
}

/** Keeps freeform pages out of DATE# calendar ranges. */
export function notePageGsi1Sk(updatedAt: string, noteId: string): string {
  return `PAGE#${updatedAt}#NOTE#${noteId}`;
}

export function taskAreaStatusGsi1Pk(
  userId: string,
  area: NotebookArea | string,
  status: string,
): string {
  return `USER#${userId}#AREA#${area}#STATUS#${status}`;
}

export function taskStartGsi1Sk(startDate: string, taskId: string): string {
  return `START#${startDate}#TASK#${taskId}`;
}

/** A null startDate (shows now) that is not someday. */
export function taskUpdatedGsi1Sk(updatedAt: string, taskId: string): string {
  return `UPDATED#${updatedAt}#TASK#${taskId}`;
}

export function taskSomedayGsi1Sk(updatedAt: string, taskId: string): string {
  return `SOMEDAY#${updatedAt}#TASK#${taskId}`;
}

/**
 * Rows stored without a `startDate` attribute, keyed by `dueDate`. Start-date
 * queries do not read this prefix: `scripts/migrate-task-start-dates.ts`
 * rekeys these rows to START#, and so does any API write.
 */
export function taskDueGsi1Sk(dueDate: string, taskId: string): string {
  return `DUE#${dueDate}#TASK#${taskId}`;
}

/** Inclusive `gsi1sk BETWEEN from AND to` on a Notebook GSI1 partition. */
export type SortKeyRange = { from: string; to: string };

const prefixRange = (prefix: string): SortKeyRange => ({
  from: prefix,
  to: `${prefix}\uffff`,
});
// `#TASK~` sorts after every `START#<day>#TASK#<id>` for that day.
const afterDay = (day: string) => `START#${day}#TASK~`;

export const taskGsi1SkRanges = {
  startOn: (day: string): SortKeyRange[] => [
    { from: `START#${day}#`, to: afterDay(day) },
  ],
  /** startDate on or before `day`, or null; never someday. */
  showsOn: (day: string): SortKeyRange[] => [
    { from: 'START#', to: afterDay(day) },
    prefixRange('UPDATED#'),
  ],
  startsAfter: (day: string): SortKeyRange[] => [
    { from: afterDay(day), to: 'START#\uffff' },
  ],
  someday: (): SortKeyRange[] => [prefixRange('SOMEDAY#')],
};

/** Sort-key ranges on a note area partition (`notebookAreaGsi1Pk`). */
export const noteGsi1SkRanges = {
  /** Daily notes dated `from`..`to` inclusive; either end may be open. */
  dates: (from?: string, to?: string): SortKeyRange => ({
    from: `DATE#${from ?? '0000-01-01'}`,
    // `#NOTE~` sorts after every `DATE#<day>#NOTE#<id>` for that day.
    to: `DATE#${to ?? '9999-12-31'}#NOTE~`,
  }),
  daily: (): SortKeyRange => prefixRange('DATE#'),
  pages: (): SortKeyRange => prefixRange('PAGE#'),
};

export function noteTasksGsi2Pk(userId: string, noteId: string): string {
  return `USER#${userId}#NOTE#${noteId}#TASKS`;
}

export function noteTasksGsi2Sk(taskId: string): string {
  return `TASK#${taskId}`;
}

/** Avoids lexicographic bugs when clients omit ms or send an offset. */
export function normalizeSyncSince(since: string): string {
  const ms = Date.parse(since);
  if (Number.isNaN(ms)) {
    throw new SyntaxError(`Invalid sync since timestamp: ${since}`);
  }
  return new Date(ms).toISOString();
}

/** Shared with the sync overlap so a write committed late in an invocation is still covered by the next poll. */
export const API_LAMBDA_TIMEOUT_MS = 10_000;

/** Must be ≥ {@link API_LAMBDA_TIMEOUT_MS} so late-committed writes are not skipped. */
export const SYNC_OVERLAP_MS = 15_000;

/** Lexicographic order matches time order only because `updatedAt` is normalized ISO-8601. */
export function syncSk(
  updatedAt: string,
  entityType: string,
  entityId: string,
): string {
  const ts = normalizeSyncSince(updatedAt);
  return `${ts}#${entityType.toUpperCase()}#${entityId}`;
}

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

export const keys = {
  post: {
    meta: (id: string) => ({ pk: postPk(id), sk: postMetaSk() }),
    published: (id: string) => ({ pk: postPk(id), sk: postPublishedSk() }),
    slugClaim: (slug: string) => ({ pk: slugPk(slug), sk: slugPostSk() }),
    slugRedirect: (slug: string) => ({
      pk: slugPk(slug),
      sk: slugRedirectSk(),
    }),
  },
  project: {
    meta: (id: string) => ({ pk: projectPk(id), sk: SK_META }),
    published: (id: string) => ({ pk: projectPk(id), sk: SK_PUBLISHED }),
    slugClaim: (slug: string) => ({
      pk: projectSlugPk(slug),
      sk: projectSlugClaimSk(),
    }),
    slugRedirect: (slug: string) => ({
      pk: projectSlugPk(slug),
      sk: SK_REDIRECT,
    }),
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
  contact: {
    msg: (contactId: string) => ({
      pk: contactPk(contactId),
      sk: contactMsgSk(),
    }),
  },
  removedUser: (userId: string) => ({
    pk: removedUsersPk(),
    sk: removedUserSk(userId),
  }),
  sync: {
    createClaim: (changeType: string, id: string) => ({
      pk: syncCreateClaimPk(changeType, id),
      sk: syncCreateClaimSk(),
    }),
    ownerCreateClaim: (userId: string, changeType: string, id: string) => ({
      pk: ownerSyncCreateClaimPk(userId, changeType, id),
      sk: syncCreateClaimSk(),
    }),
  },
  notebook: {
    note: {
      meta: (userId: string, id: string) => ({
        pk: notePk(userId, id),
        sk: noteMetaSk(),
      }),
    },
    dailyClaim: (userId: string, area: string, date: string) => ({
      pk: dailyNoteClaimPk(userId, area, date),
      sk: dailyNoteClaimSk(),
    }),
    task: {
      meta: (userId: string, id: string) => ({
        pk: taskPk(userId, id),
        sk: taskMetaSk(),
      }),
    },
  },
} as const;
