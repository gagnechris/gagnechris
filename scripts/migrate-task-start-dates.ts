#!/usr/bin/env npx tsx
/**
 * Copies `dueDate` into `startDate` on task rows stored without one and moves
 * their GSI1 key from DUE# to START#. Dry run by default; `--apply` writes;
 * `--verify` exits 2 while any row is unmigrated. Prints one JSON line of
 * counts, never ids or task text. Re-running `--apply` is a no-op.
 *
 *   AWS_PROFILE=gagnechris-readonly npx tsx scripts/migrate-task-start-dates.ts
 *   AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-task-start-dates.ts --apply
 *   AWS_PROFILE=gagnechris-readonly npx tsx scripts/migrate-task-start-dates.ts --verify
 *
 * Table: --table, else DATA_TABLE_NAME, else gagnechris-prod. Honors
 * AWS_ENDPOINT_URL_DYNAMODB for DynamoDB Local. Exit 1 if a write lost a race
 * with an API save; re-run.
 */
import { parseArgs } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  migrateTaskStartDates,
  taskStartDateMigrationExitCode,
} from '@gagnechris/api/tasks/start-date-migration';

const { values } = parseArgs({
  options: {
    table: { type: 'string' },
    apply: { type: 'boolean', default: false },
    verify: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

if (values.help || (values.apply && values.verify)) {
  console.log(
    'Usage: npx tsx scripts/migrate-task-start-dates.ts [--table <name>] [--apply | --verify]',
  );
  process.exit(values.help ? 0 : 1);
}

const tableName =
  values.table ?? process.env.DATA_TABLE_NAME ?? 'gagnechris-prod';
const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region:
      process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
  }),
);

try {
  const report = await migrateTaskStartDates({
    doc,
    tableName,
    mode: values.apply ? 'apply' : values.verify ? 'verify' : 'dry-run',
  });
  console.log(JSON.stringify(report));
  const code = taskStartDateMigrationExitCode(report);
  if (code === 1) {
    console.error('Some tasks changed during the run; re-run to pick them up.');
  }
  process.exit(code);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
