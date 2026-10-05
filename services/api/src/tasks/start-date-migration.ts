import {
  ScanCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { isOptimisticLockConflict, taskStartGsi1Sk } from '@gagnechris/data';
import {
  VERSION_MATCH_CONDITION,
  versionMatchValues,
} from '../data/version-condition.js';

export type TaskStartDateMigrationMode = 'dry-run' | 'apply' | 'verify';

/** Counts only: the report never carries ids, titles or descriptions. */
export type TaskStartDateMigrationReport = {
  table: string;
  mode: TaskStartDateMigrationMode;
  scanned: number;
  tasks: number;
  alreadyMigrated: number;
  pending: number;
  pendingDated: number;
  pendingUndated: number;
  pendingTombstones: number;
  written: number;
  conflicts: number;
};

type LegacyTaskRow = {
  pk: string;
  sk: string;
  id: string;
  dueDate: string | null;
  version?: number;
  gsi1sk?: string;
  deleted?: boolean;
};

// Never project title, description or tags.
const PROJECTION = 'pk, sk, id, dueDate, startDate, version, gsi1sk, deleted';

/**
 * Sets `startDate` from `dueDate` (and `someday = false`) on task META rows
 * stored without a `startDate` attribute, and moves dated rows from DUE# to
 * START# on GSI1. The API already reads such rows as starting on `dueDate`,
 * so the served task is unchanged: no version, `updatedAt` or sync-feed bump.
 * Each write is conditional on the version read and on `startDate` still
 * being absent, so an API save in between always wins.
 */
export async function migrateTaskStartDates(opts: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  mode: TaskStartDateMigrationMode;
}): Promise<TaskStartDateMigrationReport> {
  const { doc, tableName, mode } = opts;
  const report: TaskStartDateMigrationReport = {
    table: tableName,
    mode,
    scanned: 0,
    tasks: 0,
    alreadyMigrated: 0,
    pending: 0,
    pendingDated: 0,
    pendingUndated: 0,
    pendingTombstones: 0,
    written: 0,
    conflicts: 0,
  };

  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'entityType = :task',
        ExpressionAttributeValues: { ':task': 'task' },
        ProjectionExpression: PROJECTION,
        ExclusiveStartKey: exclusiveStartKey,
        ConsistentRead: true,
      }),
    );
    report.scanned += page.ScannedCount ?? 0;
    for (const raw of page.Items ?? []) {
      report.tasks += 1;
      if (raw.startDate !== undefined) {
        report.alreadyMigrated += 1;
        continue;
      }
      const row = raw as LegacyTaskRow;
      report.pending += 1;
      if (row.deleted === true) report.pendingTombstones += 1;
      else if (row.dueDate) report.pendingDated += 1;
      else report.pendingUndated += 1;
      if (mode !== 'apply') continue;
      if (await writeStartDate(doc, tableName, row)) report.written += 1;
      else report.conflicts += 1;
    }
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return report;
}

async function writeStartDate(
  doc: DynamoDBDocumentClient,
  tableName: string,
  row: LegacyTaskRow,
): Promise<boolean> {
  const startDate = row.dueDate ?? null;
  // Undated rows already use UPDATED#; tombstones have no GSI1 keys.
  const rekey = startDate !== null && row.gsi1sk?.startsWith('DUE#') === true;
  try {
    await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: row.pk, sk: row.sk },
        UpdateExpression: rekey
          ? 'SET startDate = :start, someday = :false, gsi1sk = :sk'
          : 'SET startDate = :start, someday = :false',
        ConditionExpression: `${VERSION_MATCH_CONDITION} AND attribute_not_exists(startDate)`,
        ExpressionAttributeValues: {
          ...versionMatchValues(row.version ?? 0),
          ':start': startDate,
          ':false': false,
          ...(rekey ? { ':sk': taskStartGsi1Sk(startDate, row.id) } : {}),
        },
      }),
    );
    return true;
  } catch (error) {
    if (!isOptimisticLockConflict(error)) throw error;
    return false;
  }
}

/** 0 ok; 1 a write lost a race (re-run); 2 verify found unmigrated rows. */
export function taskStartDateMigrationExitCode(
  report: TaskStartDateMigrationReport,
): number {
  if (report.conflicts > 0) return 1;
  if (report.mode === 'verify' && report.pending > 0) return 2;
  return 0;
}
