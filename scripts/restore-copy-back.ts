#!/usr/bin/env npx tsx
/**
 * Copy selected Notebook notes/tasks from a scratch restore table back into
 * the live table. Dry run by default; `--apply` writes.
 *
 *   npx tsx scripts/restore-copy-back.ts \
 *     --source gagnechris-prod-restore-20261003 --target gagnechris-prod \
 *     --owner <cognito sub> [--types note,task] [--ids <id>,<id>] \
 *     [--overwrite-newer] [--show-titles] [--apply]
 *
 * Target must be gagnechris-prod or gagnechris-local; source must differ and
 * must not be a live table. Uses the default AWS credential chain (and
 * AWS_ENDPOINT_URL_DYNAMODB for DynamoDB Local). Exit 2 if any write hit a
 * conflict. See infra/RUNBOOK.md "Restore my notes".
 */
import { parseArgs } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  COPY_BACK_TYPES,
  WRITE_ACTIONS,
  applyCopyBack,
  formatCopyBackPlan,
  planCopyBack,
  type CopyBackType,
} from '@gagnechris/api/restore/copy-back';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    target: { type: 'string' },
    owner: { type: 'string' },
    types: { type: 'string', default: COPY_BACK_TYPES.join(',') },
    ids: { type: 'string' },
    'overwrite-newer': { type: 'boolean', default: false },
    'show-titles': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

function usage(code: number): never {
  console.log(
    'Usage: npx tsx scripts/restore-copy-back.ts --source <scratch table> --target gagnechris-prod|gagnechris-local --owner <cognito sub> [--types note,task] [--ids a,b] [--overwrite-newer] [--show-titles] [--apply]',
  );
  process.exit(code);
}

if (values.help) usage(0);
if (!values.source || !values.target || !values.owner) usage(1);

const list = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const types = list(values.types).map((t) => t.toLowerCase());
for (const t of types) {
  if (!(COPY_BACK_TYPES as readonly string[]).includes(t)) {
    console.error(
      `Unknown type "${t}" (expected ${COPY_BACK_TYPES.join(', ')})`,
    );
    process.exit(1);
  }
}

const opts = {
  sourceTable: values.source,
  targetTable: values.target,
  userId: values.owner,
  types: types as CopyBackType[],
  ids: list(values.ids),
  overwriteNewer: values['overwrite-newer'],
};

const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region:
      process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

try {
  const plan = await planCopyBack(doc, opts);
  const writes = plan.filter((e) => WRITE_ACTIONS.has(e.action));
  console.log(
    `${values.apply ? 'APPLY' : 'DRY RUN'}: ${opts.sourceTable} -> ${opts.targetTable}, owner ${opts.userId}, ${plan.length} row(s), ${writes.length} to write`,
  );
  for (const line of formatCopyBackPlan(plan, {
    showTitles: values['show-titles'],
  })) {
    console.log(`  ${line}`);
  }
  if (!values.apply) {
    console.log('Dry run only. Re-run with --apply to write.');
    process.exit(0);
  }
  const results = await applyCopyBack(doc, opts, plan);
  for (const r of results) {
    console.log(
      `  ${r.outcome.padEnd(8)} ${r.type} ${r.id}${r.newVersion ? ` v${r.newVersion}` : ''}${r.detail ? `  (${r.detail})` : ''}`,
    );
  }
  const conflicts = results.filter((r) => r.outcome === 'conflict').length;
  console.log(
    `Wrote ${results.length - conflicts} row(s); ${conflicts} conflict(s).`,
  );
  process.exit(conflicts > 0 ? 2 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
