#!/usr/bin/env npx tsx
/**
 * Moves experience dates out of `company` ("Ro | July 2019 - Present") into
 * `start`/`end` (YYYY-MM, null = present) on the draft and PUBLISHED resume
 * rows. Dry run by default; `--apply` writes; `--verify` exits 2 while any row
 * is unmigrated or unparseable. Prints ids, versions, company names and dates
 * only. Lines that would not re-render identically are reported, not written.
 *
 *   AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-resume-dates.ts
 *   AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-resume-dates.ts --apply
 *   AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-resume-dates.ts --verify
 *
 * Table: --table, else DATA_TABLE_NAME, else gagnechris-prod. Honors
 * AWS_ENDPOINT_URL_DYNAMODB for DynamoDB Local. Exit 1 if a write lost a race
 * with an API save; re-run.
 */
import { parseArgs } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  formatResumeDateMigrationReport,
  migrateResumeDates,
  resumeDateMigrationExitCode,
} from '@gagnechris/api/resume/date-migration';

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
    'Usage: npx tsx scripts/migrate-resume-dates.ts [--table <name>] [--apply | --verify]',
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
  { marshallOptions: { removeUndefinedValues: true } },
);

try {
  const report = await migrateResumeDates({
    doc,
    tableName,
    mode: values.apply ? 'apply' : values.verify ? 'verify' : 'dry-run',
  });
  for (const line of formatResumeDateMigrationReport(report)) {
    console.log(line);
  }
  const code = resumeDateMigrationExitCode(report);
  if (code === 1) {
    console.error('The resume changed during the run; re-run to pick it up.');
  }
  process.exit(code);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
