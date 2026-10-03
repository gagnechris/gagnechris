#!/usr/bin/env node
/**
 * Counts daily-note claims (`USER#…#DAILY#<area>#<date>`) whose holder note
 * META row is missing or a tombstone. Such a claim blocks that day for good
 * on API versions that predate stale-claim release. Dry run by default;
 * prints counts only, never ids, dates or content.
 *
 *   AWS_PROFILE=gagnechris-readonly node scripts/scan-orphan-daily-claims.mjs
 *   AWS_PROFILE=<deploy/admin profile> node scripts/scan-orphan-daily-claims.mjs --apply
 *   AWS_PROFILE=gagnechris-readonly node scripts/scan-orphan-daily-claims.mjs --verify
 *
 * `--apply` deletes each orphaned claim conditional on it still pointing at
 * the same note id, so a claim re-taken mid-run is never touched.
 * `--verify` exits 2 if any orphaned claim remains.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const ALLOWED_TABLES = new Set(['gagnechris-prod', 'gagnechris-local']);
const tableName = process.env.DATA_TABLE_NAME ?? 'gagnechris-prod';
const region = process.env.AWS_REGION ?? 'us-east-1';
const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');

if (!ALLOWED_TABLES.has(tableName)) {
  console.error(
    `Refusing table ${tableName}; expected one of ${[...ALLOWED_TABLES].join(', ')}`,
  );
  process.exit(1);
}
if (apply && verify) {
  console.error('Pass --apply or --verify, not both');
  process.exit(1);
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

// Must match keys.notebook.note.meta in packages/data.
const noteMetaKey = (userId, noteId) => ({
  pk: `USER#${userId}#NOTE#${noteId}`,
  sk: 'META',
});

const counts = {
  scanned: 0,
  claims: 0,
  live: 0,
  holderMissing: 0,
  holderDeleted: 0,
  malformed: 0,
  released: 0,
  conditionFailed: 0,
};

let exclusiveStartKey;
do {
  const page = await doc.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: 'entityType = :claim',
      ExpressionAttributeValues: { ':claim': 'dailyNoteClaim' },
      ProjectionExpression: 'pk, sk, userId, noteId',
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  counts.scanned += page.ScannedCount ?? 0;
  for (const claim of page.Items ?? []) {
    counts.claims += 1;
    if (typeof claim.userId !== 'string' || typeof claim.noteId !== 'string') {
      counts.malformed += 1;
      continue;
    }
    const holder = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: noteMetaKey(claim.userId, claim.noteId),
        ProjectionExpression: 'pk, deleted',
        ConsistentRead: true,
      }),
    );
    if (!holder.Item) {
      counts.holderMissing += 1;
    } else if (holder.Item.deleted === true) {
      counts.holderDeleted += 1;
    } else {
      counts.live += 1;
      continue;
    }
    if (!apply) continue;
    try {
      await doc.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: claim.pk, sk: claim.sk },
          ConditionExpression: 'noteId = :id',
          ExpressionAttributeValues: { ':id': claim.noteId },
        }),
      );
      counts.released += 1;
    } catch (error) {
      if (error?.name !== 'ConditionalCheckFailedException') throw error;
      counts.conditionFailed += 1;
    }
  }
  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey);

const mode = apply ? 'apply' : verify ? 'verify' : 'dry-run';
console.log(JSON.stringify({ table: tableName, mode, ...counts }));
const orphaned = counts.holderMissing + counts.holderDeleted;
if (verify && orphaned > 0) process.exitCode = 2;
if (apply && counts.conditionFailed > 0) {
  console.error('Some claims changed during the run; re-run to pick them up.');
  process.exitCode = 1;
}
