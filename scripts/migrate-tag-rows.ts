#!/usr/bin/env npx tsx
/**
 * Deletes the posts' tag index rows (`TAG#<tag>` / `TS#<publishedAt>#POST#<id>`,
 * `entityType = tagIndex`), which nothing reads or writes. Dry run by default;
 * `--apply` deletes; `--verify` exits 2 while any remain. Prints one JSON line
 * of counts. Re-running `--apply` is a no-op.
 *
 *   AWS_PROFILE=gagnechris-readonly npx tsx scripts/migrate-tag-rows.ts
 *   AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-tag-rows.ts --apply
 *   AWS_PROFILE=gagnechris-readonly npx tsx scripts/migrate-tag-rows.ts --verify
 *
 * Table: --table, else DATA_TABLE_NAME, else gagnechris-prod. Honors
 * AWS_ENDPOINT_URL_DYNAMODB for DynamoDB Local.
 */
import { parseArgs } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  cleanupTagRows,
  tagRowCleanupExitCode,
} from '@gagnechris/ops/tag-row-cleanup';

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
    'Usage: npx tsx scripts/migrate-tag-rows.ts [--table <name>] [--apply | --verify]',
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
  const report = await cleanupTagRows({
    doc,
    tableName,
    mode: values.apply ? 'apply' : values.verify ? 'verify' : 'dry-run',
  });
  console.log(JSON.stringify(report));
  process.exit(tagRowCleanupExitCode(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
