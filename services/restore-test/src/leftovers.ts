/**
 * Daily check for restore scratch tables nobody deleted (CHR-198).
 *
 * Matches the names our restores use:
 * - `awsbackup-restore-test-*`: AWS Backup restore testing (auto-deleted after
 *   the validation window; a survivor means the deletion failed)
 * - `gagnechris-<env>-restore-*`: manual PITR rehearsal / "restore my notes"
 * - `gagnechris-<env>-backup-restore-*`: manual AWS Backup vault restore
 *
 * A table older than `maxAgeHours` is a leftover: it is a full copy of prod,
 * private notes included, with no deletion protection, PITR or Backup.
 */
import { RESTORE_TEST_TABLE_PREFIX } from './validate.js';

/** Default age before a scratch table counts as leftover. */
export const DEFAULT_LEFTOVER_MAX_AGE_HOURS = 24;

const MANUAL_RESTORE_NAME = /^gagnechris-[a-z0-9]+-(?:backup-)?restore-.+/;

export function isRestoreScratchTableName(name: string): boolean {
  return (
    (name.startsWith(RESTORE_TEST_TABLE_PREFIX) &&
      name.length > RESTORE_TEST_TABLE_PREFIX.length) ||
    MANUAL_RESTORE_NAME.test(name)
  );
}

export type ListTablesFn = (exclusiveStartTableName?: string) => Promise<{
  TableNames?: string[];
  LastEvaluatedTableName?: string;
}>;

/** Table creation time, or undefined when the table is already gone. */
export type DescribeCreationFn = (
  tableName: string,
) => Promise<Date | undefined>;

export type LeftoverTable = { tableName: string; ageHours: number };

export async function findLeftoverRestoreTables(
  deps: { listTables: ListTablesFn; describeCreation: DescribeCreationFn },
  now: Date,
  maxAgeHours: number = DEFAULT_LEFTOVER_MAX_AGE_HOURS,
): Promise<LeftoverTable[]> {
  const candidates: string[] = [];
  let start: string | undefined;
  do {
    const page = await deps.listTables(start);
    for (const name of page.TableNames ?? []) {
      if (isRestoreScratchTableName(name)) candidates.push(name);
    }
    start = page.LastEvaluatedTableName;
  } while (start);

  const leftovers: LeftoverTable[] = [];
  for (const tableName of candidates) {
    const created = await deps.describeCreation(tableName);
    if (!created) continue;
    const ageHours = (now.getTime() - created.getTime()) / 3_600_000;
    if (ageHours >= maxAgeHours) {
      leftovers.push({ tableName, ageHours: Math.floor(ageHours) });
    }
  }
  return leftovers;
}
