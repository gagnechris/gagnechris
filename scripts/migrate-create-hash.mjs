#!/usr/bin/env node
/**
 * One-off CHR-192 migration: replace plaintext `createHash` values.
 *
 * Before CHR-192, `createHash` held the NUL-joined create fields (note body,
 * task description, ...) on the META row and on the sync create claim, and
 * deletes copied it onto the tombstone. This script:
 *   - live META rows: rewrites the value to `sha256:<hex>` of the old string
 *     (exactly what the API now computes, so idempotent replays still match);
 *   - tombstones and create claims: removes `createHash` (never read there).
 *
 * Dry run by default; prints counts only, never values. Writes are
 * conditional on the old value so a concurrent API write is never clobbered.
 *
 *   AWS_PROFILE=<deploy or admin profile> node scripts/migrate-create-hash.mjs
 *   AWS_PROFILE=<...> node scripts/migrate-create-hash.mjs --apply
 *   AWS_PROFILE=gagnechris-readonly node scripts/migrate-create-hash.mjs --verify
 *
 * PITR and AWS Backup recovery points keep pre-migration copies until their
 * retention ends (PITR 35 days, Backup per the vault's rules).
 */
import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const PREFIX = 'sha256:';
const tableName = process.env.DATA_TABLE_NAME ?? 'gagnechris-prod';
const region = process.env.AWS_REGION ?? 'us-east-1';
const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const hashJoined = (joined) =>
  PREFIX + createHash('sha256').update(joined).digest('hex');

/** Matches `isDeleted` for notes/tasks (soft-delete tombstones). */
const isTombstone = (item) => item.deleted === true;
const isClaim = (item) => item.entityType === 'syncCreateClaim';

const counts = {
  scanned: 0,
  withCreateHash: 0,
  liveAlreadyHashed: 0,
  liveToHash: 0,
  tombstoneToStrip: 0,
  claimToStrip: 0,
  conditionFailed: 0,
};

let exclusiveStartKey;
do {
  const page = await doc.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: 'attribute_exists(createHash)',
      ProjectionExpression: 'pk, sk, entityType, deleted, createHash',
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  counts.scanned += page.ScannedCount ?? 0;
  for (const item of page.Items ?? []) {
    counts.withCreateHash += 1;
    const old = item.createHash;
    const key = { pk: item.pk, sk: item.sk };
    let update;
    if (isClaim(item) || isTombstone(item)) {
      counts[isClaim(item) ? 'claimToStrip' : 'tombstoneToStrip'] += 1;
      update = { UpdateExpression: 'REMOVE createHash' };
    } else if (typeof old === 'string' && old.startsWith(PREFIX)) {
      counts.liveAlreadyHashed += 1;
      continue;
    } else {
      counts.liveToHash += 1;
      update = {
        UpdateExpression: 'SET createHash = :next',
        ExpressionAttributeValues: { ':next': hashJoined(String(old)) },
      };
    }
    if (!apply) continue;
    try {
      await doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key,
          ...update,
          ConditionExpression: 'createHash = :old',
          ExpressionAttributeValues: {
            ...(update.ExpressionAttributeValues ?? {}),
            ':old': old,
          },
        }),
      );
    } catch (error) {
      if (error?.name !== 'ConditionalCheckFailedException') throw error;
      counts.conditionFailed += 1;
    }
  }
  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey);

const mode = apply ? 'apply' : verify ? 'verify' : 'dry-run';
console.log(JSON.stringify({ table: tableName, mode, ...counts }));
const remaining =
  counts.liveToHash + counts.tombstoneToStrip + counts.claimToStrip;
if (verify && remaining > 0) process.exitCode = 2;
if (apply && counts.conditionFailed > 0) {
  console.error('Some rows changed during the run; re-run to pick them up.');
  process.exitCode = 1;
}
