/**
 * Single source of DynamoDB key strings (CHR-128).
 * Application code must import builders from here — do not hard-code prefixes.
 */

import type { NotebookArea } from '@gagnechris/shared';

export type { NotebookArea };

export const SK_META = 'META';
export const SK_PUBLISHED = 'PUBLISHED';
export const SK_POST = 'POST';
export const SK_REDIRECT = 'REDIRECT';
export const SK_MSG = 'MSG';
/** Daily-note claim sort key (Notebook). */
export const SK_NOTE = 'NOTE';

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

/**
 * Create-claim TTL (CHR-162). Longer than tombstone TTL so a purged META row
 * cannot be resurrected by an offline create replay.
 */
export const SYNC_CREATE_CLAIM_TTL_DAYS = 365;

/**
 * Safety margin inside the tombstone TTL for the sync `since` horizon
 * (CHR-172 / CHR-202). Covers clock skew between the TTL stamp and
 * `updatedAt` and the per-second TTL granularity.
 */
export const SYNC_RESYNC_MARGIN_MS = 24 * 60 * 60 * 1000;

/**
 * ISO watermark: `since` older than this requires a full resync (CHR-172).
 * A tombstone stamped at `t` may be purged from `t + TTL`, so every change the
 * client still needs (`updatedAt ≥ since − SYNC_OVERLAP_MS`) is only
 * guaranteed present while `since − overlap ≥ now − TTL + margin`. The horizon
 * is therefore `now − TTL + margin + overlap` (CHR-202: it used to subtract
 * the margin, serving 200 for watermarks whose deletes may already be gone).
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

/**
 * Sparse GSI partition for a user's sync feed (CHR-153).
 * Written on the entity META item (not a separate ledger row).
 */
export function syncPk(userId: string): string {
  return `SYNC#${userId}`;
}

/**
 * Durable create claim so client-ULID ids cannot resurrect after tombstone TTL
 * (CHR-162). Not projected on the sync GSI.
 */
export function syncCreateClaimPk(
  changeType: string,
  entityId: string,
): string {
  return `CREATED#${changeType.toUpperCase()}#${entityId}`;
}

/**
 * Owner-scoped create claim (CHR-169). Includes Cognito `sub` so two users
 * never share a claim partition even if client ULIDs collide.
 */
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

// --- Notebook owner-scoped keys (CHR-39 / CHR-169) ---

/** Note META partition: `USER#<sub>#NOTE#<id>`. */
export function notePk(userId: string, noteId: string): string {
  return `USER#${userId}#NOTE#${noteId}`;
}

export function noteMetaSk(): string {
  return SK_META;
}

/**
 * Daily-note uniqueness claim: one note per `(user, area, date)`.
 * Item stores `noteId` so a losing create can resolve to the winner.
 */
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

/** Task META partition: `USER#<sub>#TASK#<id>`. */
export function taskPk(userId: string, taskId: string): string {
  return `USER#${userId}#TASK#${taskId}`;
}

export function taskMetaSk(): string {
  return SK_META;
}

/**
 * GSI1 partition for notes by area (calendar / list). Namespaced by user so
 * Notebook never shares post `STATUS#*` partitions.
 */
export function notebookAreaGsi1Pk(
  userId: string,
  area: NotebookArea | string,
): string {
  return `USER#${userId}#AREA#${area}`;
}

/**
 * Note GSI1 sort key by note date (calendar dots / date-range queries).
 * Example: `DATE#2026-10-02#NOTE#01ABC…`
 */
export function noteDateGsi1Sk(noteDate: string, noteId: string): string {
  return `DATE#${noteDate}#NOTE#${noteId}`;
}

/**
 * Note GSI1 sort key for freeform pages (keeps them out of DATE# calendar ranges).
 * Example: `PAGE#2026-10-02T12:00:00.000Z#NOTE#01ABC…`
 */
export function notePageGsi1Sk(updatedAt: string, noteId: string): string {
  return `PAGE#${updatedAt}#NOTE#${noteId}`;
}

/**
 * GSI1 partition for tasks by area + status.
 * Example: `USER#<sub>#AREA#work#STATUS#todo`
 */
export function taskAreaStatusGsi1Pk(
  userId: string,
  area: NotebookArea | string,
  status: string,
): string {
  return `USER#${userId}#AREA#${area}#STATUS#${status}`;
}

/**
 * Task GSI1 sort key by due date (due / overdue range queries).
 * Undated tasks must not use this prefix — see {@link taskUpdatedGsi1Sk}.
 */
export function taskDueGsi1Sk(dueDate: string, taskId: string): string {
  return `DUE#${dueDate}#TASK#${taskId}`;
}

/**
 * Task GSI1 sort key when there is no due date (keeps undated tasks out of
 * due/overdue ranges).
 */
export function taskUpdatedGsi1Sk(updatedAt: string, taskId: string): string {
  return `UPDATED#${updatedAt}#TASK#${taskId}`;
}

/**
 * GSI2 partition for tasks linked to a note.
 * Example: `USER#<sub>#NOTE#<noteId>#TASKS`
 */
export function noteTasksGsi2Pk(userId: string, noteId: string): string {
  return `USER#${userId}#NOTE#${noteId}#TASKS`;
}

export function noteTasksGsi2Sk(taskId: string): string {
  return `TASK#${taskId}`;
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

/**
 * API Lambda timeout (CHR-162). Shared with the sync overlap window so a write
 * that commits near the end of an invocation is still covered by the next poll.
 */
export const API_LAMBDA_TIMEOUT_MS = 10_000;

/**
 * Overlap window re-queried on each poll so late-committed writes are not skipped.
 * Must be ≥ {@link API_LAMBDA_TIMEOUT_MS} (enforced in tests).
 */
export const SYNC_OVERLAP_MS = 15_000;

/**
 * Sync GSI sort key — lexicographic order ≈ time order when `updatedAt` is ISO-8601.
 * Example: `2026-09-28T22:00:00.000Z#NOTE#01ABC…`
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
  sync: {
    pk: (userId: string) => syncPk(userId),
    sk: (updatedAt: string, entityType: string, entityId: string) =>
      syncSk(updatedAt, entityType, entityId),
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
    areaGsi1: (userId: string, area: string) =>
      notebookAreaGsi1Pk(userId, area),
    noteDateSk: (noteDate: string, noteId: string) =>
      noteDateGsi1Sk(noteDate, noteId),
    notePageSk: (updatedAt: string, noteId: string) =>
      notePageGsi1Sk(updatedAt, noteId),
    taskAreaStatusGsi1: (userId: string, area: string, status: string) =>
      taskAreaStatusGsi1Pk(userId, area, status),
    taskDueSk: (dueDate: string, taskId: string) =>
      taskDueGsi1Sk(dueDate, taskId),
    taskUpdatedSk: (updatedAt: string, taskId: string) =>
      taskUpdatedGsi1Sk(updatedAt, taskId),
    noteTasksGsi2: (userId: string, noteId: string) =>
      noteTasksGsi2Pk(userId, noteId),
    noteTasksSk: (taskId: string) => noteTasksGsi2Sk(taskId),
  },
  status: (status: string) => statusGsi1Pk(status),
} as const;
