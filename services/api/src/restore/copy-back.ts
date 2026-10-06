/**
 * Copy-back writes follow the repository conventions so clients see the change
 * (see infra/RUNBOOK.md):
 * - sync stamps at copy-back time, so the change feed returns the restored row
 * - version bumped past the live row with the API's optimistic condition, so a
 *   concurrent edit is never clobbered
 * - plaintext `createHash` from an old restore point is hashed
 * - no `ttl`: a restored tombstone becomes a live row again
 */
import {
  GetCommand,
  ScanCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  SK_META,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  appTableName,
  buildDailyNoteClaimItem,
  buildNoteMetaItem,
  buildTaskMetaItem,
  isOptimisticLockConflict,
  keys,
  metaToNote,
  metaToTask,
  noteContentEqual,
  notePk,
  ownerSyncCreateClaimPk,
  parseNoteMetaItem,
  parseTaskMetaItem,
  syncCreateClaimSk,
  syncPk,
  syncSk,
  taskContentEqual,
  taskPk,
  ttlDaysFromNow,
} from '@gagnechris/data';
import type { Note, Task } from '@gagnechris/shared';
import { systemClock, type Clock } from '../data/clock.js';
import {
  hashJoinedCreateFields,
  isHashedCreateHash,
} from '../data/create-hash.js';
import {
  VERSION_MATCH_CONDITION,
  versionMatchValues,
} from '../data/version-condition.js';

export const COPY_BACK_TYPES = ['note', 'task'] as const;
export type CopyBackType = (typeof COPY_BACK_TYPES)[number];

/** The only tables copy-back may write to. */
export const DEFAULT_ALLOWED_TARGETS: readonly string[] = [
  appTableName('prod'),
  appTableName('local'),
];

export type CopyBackOptions = {
  sourceTable: string;
  targetTable: string;
  /** Cognito `sub` that owns the rows (the `USER#<sub>#…` key segment). */
  userId: string;
  types?: readonly CopyBackType[];
  ids?: readonly string[];
  /** Overwrite a live row that changed after the restore point. */
  overwriteNewer?: boolean;
  /** Tests only; the CLI always uses {@link DEFAULT_ALLOWED_TARGETS}. */
  allowedTargets?: readonly string[];
  now?: Clock;
};

export type CopyBackAction =
  | 'create'
  | 'undelete'
  | 'overwrite'
  | 'skip-identical'
  | 'skip-target-newer'
  | 'skip-source-deleted'
  | 'skip-daily-taken'
  | 'skip-daily-moved'
  | 'skip-invalid'
  | 'skip-not-in-source';

export const WRITE_ACTIONS: ReadonlySet<CopyBackAction> = new Set([
  'create',
  'undelete',
  'overwrite',
]);

type Entity = Note | Task;

type DailyClaimPlan =
  | { kind: 'none' }
  | { kind: 'held' }
  | { kind: 'absent' }
  | { kind: 'stale'; holderId: string };

export type CopyBackEntry = {
  type: CopyBackType;
  id: string;
  action: CopyBackAction;
  reason?: string;
  warnings: string[];
  title?: string;
  sourceVersion?: number;
  sourceUpdatedAt?: string;
  targetVersion?: number;
  targetUpdatedAt?: string;
  targetDeleted?: boolean;
  newVersion?: number;
  write?: {
    source: Entity;
    /** undefined → the live row must not exist. */
    expectedVersion?: number;
    createHash?: string;
    dailyClaim: DailyClaimPlan;
  };
};

export type CopyBackResult = {
  type: CopyBackType;
  id: string;
  outcome: 'written' | 'conflict';
  newVersion?: number;
  detail?: string;
};

export class CopyBackRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopyBackRefusedError';
  }
}

export function assertCopyBackTables(
  sourceTable: string,
  targetTable: string,
  allowedTargets: readonly string[] = DEFAULT_ALLOWED_TARGETS,
): void {
  if (!sourceTable || !targetTable) {
    throw new CopyBackRefusedError('source and target tables are required');
  }
  if (sourceTable === targetTable) {
    throw new CopyBackRefusedError('source and target are the same table');
  }
  if (!allowedTargets.includes(targetTable)) {
    throw new CopyBackRefusedError(
      `refusing to write to "${targetTable}": target must be one of ${allowedTargets.join(', ')}`,
    );
  }
  if (DEFAULT_ALLOWED_TARGETS.includes(sourceTable)) {
    throw new CopyBackRefusedError(
      `source "${sourceTable}" is a live table; copy back from a scratch restore`,
    );
  }
}

const KEY_FOR: Record<
  CopyBackType,
  (userId: string, id: string) => { pk: string; sk: string }
> = {
  note: keys.notebook.note.meta,
  task: keys.notebook.task.meta,
};

function parseEntity(type: CopyBackType, raw: Record<string, unknown>): Entity {
  return type === 'note'
    ? metaToNote(parseNoteMetaItem(raw))
    : metaToTask(parseTaskMetaItem(raw));
}

function contentEqual(type: CopyBackType, a: Entity, b: Entity): boolean {
  return type === 'note'
    ? noteContentEqual(a as Note, b as Note)
    : taskContentEqual(a as Task, b as Task);
}

function typeOfItem(item: Record<string, unknown>): CopyBackType | undefined {
  return item.entityType === 'note' || item.entityType === 'task'
    ? item.entityType
    : undefined;
}

/** Old restore points may hold a plaintext createHash; never let it land in prod again. */
function normalizeCreateHash(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return isHashedCreateHash(raw) ? raw : hashJoinedCreateFields(raw);
}

async function scanSourceRows(
  doc: DynamoDBDocumentClient,
  opts: CopyBackOptions,
  types: readonly CopyBackType[],
): Promise<Record<string, unknown>[]> {
  const prefixes: Record<CopyBackType, string> = {
    note: notePk(opts.userId, ''),
    task: taskPk(opts.userId, ''),
  };
  const values: Record<string, unknown> = { ':meta': SK_META };
  const clauses = types.map((type, i) => {
    values[`:p${i}`] = prefixes[type];
    return `begins_with(pk, :p${i})`;
  });
  const rows: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: opts.sourceTable,
        FilterExpression: `(${clauses.join(' OR ')}) AND sk = :meta`,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: startKey,
      }),
    );
    rows.push(...((page.Items ?? []) as Record<string, unknown>[]));
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return rows;
}

async function getRaw(
  doc: DynamoDBDocumentClient,
  tableName: string,
  key: { pk: string; sk: string },
): Promise<Record<string, unknown> | undefined> {
  const out = await doc.send(
    new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
  );
  return out.Item as Record<string, unknown> | undefined;
}

async function planDailyClaim(
  doc: DynamoDBDocumentClient,
  targetTable: string,
  note: Note,
): Promise<DailyClaimPlan | { kind: 'taken'; holderId: string }> {
  if (note.type !== 'daily' || !note.date) return { kind: 'none' };
  const claim = await getRaw(
    doc,
    targetTable,
    keys.notebook.dailyClaim(note.userId, note.area, note.date),
  );
  const holderId = typeof claim?.noteId === 'string' ? claim.noteId : undefined;
  if (!holderId) return { kind: 'absent' };
  if (holderId === note.id) return { kind: 'held' };
  const holder = await getRaw(
    doc,
    targetTable,
    keys.notebook.note.meta(note.userId, holderId),
  );
  const live = holder !== undefined && holder.deleted !== true;
  return live ? { kind: 'taken', holderId } : { kind: 'stale', holderId };
}

export async function planCopyBack(
  doc: DynamoDBDocumentClient,
  opts: CopyBackOptions,
): Promise<CopyBackEntry[]> {
  assertCopyBackTables(opts.sourceTable, opts.targetTable, opts.allowedTargets);
  const types = opts.types?.length ? opts.types : COPY_BACK_TYPES;
  const idFilter = opts.ids?.length ? new Set(opts.ids) : undefined;

  const rows = await scanSourceRows(doc, opts, types);
  const entries: CopyBackEntry[] = [];
  const found = new Set<string>();

  for (const raw of rows) {
    const type = typeOfItem(raw);
    const id = typeof raw.id === 'string' ? raw.id : undefined;
    if (!type || !id || !types.includes(type)) continue;
    if (idFilter && !idFilter.has(id)) continue;
    found.add(id);
    const entry: CopyBackEntry = {
      type,
      id,
      action: 'skip-invalid',
      warnings: [],
    };
    entries.push(entry);

    let source: Entity;
    try {
      source = parseEntity(type, raw);
    } catch {
      entry.reason = 'source row does not parse';
      continue;
    }
    if (source.userId !== opts.userId) {
      entry.reason = 'source row belongs to another owner';
      continue;
    }
    entry.title = source.title;
    entry.sourceVersion = source.version;
    entry.sourceUpdatedAt = source.updatedAt;
    if (source.deleted) {
      entry.action = 'skip-source-deleted';
      entry.reason = 'deleted at the restore point too';
      continue;
    }

    const targetRaw = await getRaw(
      doc,
      opts.targetTable,
      KEY_FOR[type](opts.userId, id),
    );
    let target: Entity | undefined;
    if (targetRaw) {
      try {
        target = parseEntity(type, targetRaw);
      } catch {
        entry.reason = 'live row does not parse; fix it by hand';
        continue;
      }
      entry.targetVersion = target.version;
      entry.targetUpdatedAt = target.updatedAt;
      entry.targetDeleted = target.deleted;
    }

    let action: CopyBackAction;
    if (!target) {
      action = 'create';
    } else if (target.deleted) {
      action = 'undelete';
    } else if (contentEqual(type, source, target)) {
      entry.action = 'skip-identical';
      continue;
    } else if (target.updatedAt > source.updatedAt && !opts.overwriteNewer) {
      entry.action = 'skip-target-newer';
      entry.reason =
        'live row changed after the restore point (--overwrite-newer to replace it)';
      continue;
    } else {
      action = 'overwrite';
    }

    let dailyClaim: DailyClaimPlan = { kind: 'none' };
    if (type === 'note') {
      const note = source as Note;
      const live = target && !target.deleted ? (target as Note) : undefined;
      if (
        live &&
        live.type === 'daily' &&
        (live.area !== note.area || live.date !== note.date)
      ) {
        entry.action = 'skip-daily-moved';
        entry.reason = 'live daily note has a different area/date; fix by hand';
        continue;
      }
      const claim = await planDailyClaim(doc, opts.targetTable, note);
      if (claim.kind === 'taken') {
        entry.action = 'skip-daily-taken';
        entry.reason = `day already held by live note ${claim.holderId}; merge by hand`;
        continue;
      }
      dailyClaim = claim;
    }

    entry.action = action;
    entry.newVersion = (target?.version ?? source.version) + 1;
    entry.write = {
      source,
      expectedVersion: target?.version,
      createHash: normalizeCreateHash(
        targetRaw && !target?.deleted ? targetRaw.createHash : raw.createHash,
      ),
      dailyClaim,
    };
  }

  for (const id of idFilter ?? []) {
    if (!found.has(id)) {
      entries.push({
        type: types[0]!,
        id,
        action: 'skip-not-in-source',
        reason: 'no row with this id for this owner in the source table',
        warnings: [],
      });
    }
  }

  // Tasks linked to a note that will not be live after the copy-back.
  const liveAfter = new Set(
    entries
      .filter((e) => e.type === 'note' && WRITE_ACTIONS.has(e.action))
      .map((e) => e.id),
  );
  for (const entry of entries) {
    const task = entry.write?.source as Task | undefined;
    if (entry.type !== 'task' || !task?.noteId || liveAfter.has(task.noteId)) {
      continue;
    }
    const note = await getRaw(
      doc,
      opts.targetTable,
      keys.notebook.note.meta(opts.userId, task.noteId),
    );
    if (!note || note.deleted === true) {
      entry.warnings.push(
        `linked note ${task.noteId} is not live in the target; restore it too (--ids) or the task shows without its note`,
      );
    }
  }

  return entries.sort(
    (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id),
  );
}

function storedItem(
  entry: CopyBackEntry,
  write: NonNullable<CopyBackEntry['write']>,
  now: string,
): Record<string, unknown> {
  const restored = {
    ...write.source,
    version: entry.newVersion!,
    updatedAt: now,
    deleted: false,
  };
  const base =
    entry.type === 'note'
      ? buildNoteMetaItem(restored as Note)
      : buildTaskMetaItem(restored as Task);
  return {
    ...base,
    entityType: entry.type,
    syncPk: syncPk(restored.userId),
    syncSk: syncSk(now, entry.type, restored.id),
    ...(write.createHash ? { createHash: write.createHash } : {}),
  };
}

export async function applyCopyBack(
  doc: DynamoDBDocumentClient,
  opts: CopyBackOptions,
  plan: readonly CopyBackEntry[],
): Promise<CopyBackResult[]> {
  assertCopyBackTables(opts.sourceTable, opts.targetTable, opts.allowedTargets);
  const nowIso = opts.now ?? systemClock;
  const results: CopyBackResult[] = [];

  for (const entry of plan) {
    const write = entry.write;
    if (!write || !WRITE_ACTIONS.has(entry.action)) continue;
    const now = nowIso();
    const item = storedItem(entry, write, now);
    const userId = write.source.userId;

    const transactItems: NonNullable<
      ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
    > = [
      {
        Put: {
          TableName: opts.targetTable,
          Item: item,
          ...(write.expectedVersion === undefined
            ? { ConditionExpression: 'attribute_not_exists(pk)' }
            : {
                ConditionExpression: VERSION_MATCH_CONDITION,
                ExpressionAttributeValues: versionMatchValues(
                  write.expectedVersion,
                ),
              }),
        },
      },
      {
        // Same shape the repository writes on create / soft-delete.
        Put: {
          TableName: opts.targetTable,
          Item: {
            pk: ownerSyncCreateClaimPk(userId, entry.type, entry.id),
            sk: syncCreateClaimSk(),
            entityType: 'syncCreateClaim',
            changeType: entry.type,
            entityId: entry.id,
            userId,
            createdAt: write.source.createdAt,
            ttl: ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, new Date(now)),
          },
        },
      },
    ];

    const note = write.source as Note;
    if (
      entry.type === 'note' &&
      note.type === 'daily' &&
      note.date &&
      (write.dailyClaim.kind === 'absent' || write.dailyClaim.kind === 'stale')
    ) {
      transactItems.push({
        Put: {
          TableName: opts.targetTable,
          Item: buildDailyNoteClaimItem(userId, note.area, note.date, note.id),
          ...(write.dailyClaim.kind === 'absent'
            ? { ConditionExpression: 'attribute_not_exists(pk)' }
            : {
                ConditionExpression: 'noteId = :holder',
                ExpressionAttributeValues: {
                  ':holder': write.dailyClaim.holderId,
                },
              }),
        },
      });
    }

    try {
      await doc.send(
        new TransactWriteCommand({ TransactItems: transactItems }),
      );
      results.push({
        type: entry.type,
        id: entry.id,
        outcome: 'written',
        newVersion: entry.newVersion,
      });
    } catch (error) {
      if (!isOptimisticLockConflict(error)) throw error;
      results.push({
        type: entry.type,
        id: entry.id,
        outcome: 'conflict',
        detail:
          'live row or daily claim changed since the plan; re-run the dry run',
      });
    }
  }
  return results;
}

/** Titles only when asked: they are private. */
export function formatCopyBackPlan(
  plan: readonly CopyBackEntry[],
  opts: { showTitles?: boolean } = {},
): string[] {
  return plan.map((e) => {
    const src =
      e.sourceVersion !== undefined
        ? `src v${e.sourceVersion} ${e.sourceUpdatedAt}`
        : 'src -';
    const tgt =
      e.targetVersion !== undefined
        ? `live v${e.targetVersion}${e.targetDeleted ? ' (deleted)' : ''} ${e.targetUpdatedAt}`
        : 'live -';
    const next = e.newVersion !== undefined ? ` => v${e.newVersion}` : '';
    const title =
      opts.showTitles && e.title !== undefined
        ? ` "${e.title.slice(0, 60)}"`
        : '';
    const reason = e.reason ? `  (${e.reason})` : '';
    const warnings = e.warnings.map((w) => `\n    warning: ${w}`).join('');
    return `${e.action.padEnd(19)} ${e.type} ${e.id}${title}  ${src} | ${tgt}${next}${reason}${warnings}`;
  });
}
