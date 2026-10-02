#!/usr/bin/env node
/**
 * Read-only prod scan for META/PUBLISHED rows missing `version` (CHR-170).
 *
 *   AWS_PROFILE=gagnechris-readonly aws sso login --sso-session gagnechris
 *   node scripts/scan-missing-version.mjs
 */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const tableName = process.env.DATA_TABLE_NAME ?? 'gagnechris-prod';
const region = process.env.AWS_REGION ?? 'us-east-1';

const client = new DynamoDBClient({ region });
let counted = 0;
let scanned = 0;
let exclusiveStartKey;

do {
  const page = await client.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: 'attribute_not_exists(#v)',
      ExpressionAttributeNames: { '#v': 'version' },
      ProjectionExpression: 'pk, sk, entityType',
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  scanned += page.ScannedCount ?? 0;
  counted += page.Count ?? 0;
  for (const item of page.Items ?? []) {
    console.log(
      JSON.stringify({
        pk: item.pk?.S,
        sk: item.sk?.S,
        entityType: item.entityType?.S,
      }),
    );
  }
  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey);

console.error(
  `scan complete: missingVersion=${counted} scanned=${scanned} table=${tableName}`,
);
process.exitCode = counted > 0 ? 2 : 0;
