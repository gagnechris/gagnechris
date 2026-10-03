#!/usr/bin/env npx tsx
/**
 * Idempotent CreateTable / UpdateTable for gagnechris-local (DynamoDB Local).
 * Schema comes from `@gagnechris/data` APP_TABLE — missing GSIs are added.
 * Requires scripts/local/env.sh sourced (or equivalent env).
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  UpdateTableCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import {
  APP_TABLE,
  appTableAttributeDefinitions,
  appTableName,
  gsiProjection,
} from '@gagnechris/data';

const tableName = process.env.DATA_TABLE_NAME || appTableName('local');
const endpoint =
  process.env.AWS_ENDPOINT_URL_DYNAMODB || 'http://127.0.0.1:8000';

if (tableName === appTableName('prod')) {
  console.error(
    `Refusing to bootstrap ${appTableName('prod')} from local scripts`,
  );
  process.exit(1);
}

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
  },
});

function createTableInput() {
  const def = APP_TABLE;
  return {
    TableName: tableName,
    BillingMode: def.billingMode,
    AttributeDefinitions: [...appTableAttributeDefinitions(def)],
    KeySchema: [
      { AttributeName: def.partitionKey.name, KeyType: 'HASH' as const },
      { AttributeName: def.sortKey.name, KeyType: 'RANGE' as const },
    ],
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: def.streamViewType,
    },
    GlobalSecondaryIndexes: def.globalSecondaryIndexes.map((gsi) => ({
      IndexName: gsi.indexName,
      KeySchema: [
        { AttributeName: gsi.partitionKey.name, KeyType: 'HASH' as const },
        { AttributeName: gsi.sortKey.name, KeyType: 'RANGE' as const },
      ],
      Projection: gsiProjection(gsi),
    })),
  };
}

async function ensureTtl() {
  const def = APP_TABLE;
  // DynamoDB Local 2.5.2+ accepts UpdateTimeToLive (CHR-180), but rejects it
  // with "TimeToLive is already enabled" on a re-run, so check first (CHR-199).
  const { DescribeTimeToLiveCommand, UpdateTimeToLiveCommand } =
    await import('@aws-sdk/client-dynamodb');
  const current = await client.send(
    new DescribeTimeToLiveCommand({ TableName: tableName }),
  );
  const ttl = current.TimeToLiveDescription;
  if (
    (ttl?.TimeToLiveStatus === 'ENABLED' ||
      ttl?.TimeToLiveStatus === 'ENABLING') &&
    ttl.AttributeName === def.timeToLiveAttribute
  ) {
    console.log(
      `TTL on ${def.timeToLiveAttribute} already enabled for ${tableName}`,
    );
    return;
  }
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        Enabled: true,
        AttributeName: def.timeToLiveAttribute,
      },
    }),
  );
  console.log(`Enabled TTL on ${def.timeToLiveAttribute} for ${tableName}`);
}

async function ensureMissingGsis(existingIndexNames: Set<string>) {
  const def = APP_TABLE;
  for (const gsi of def.globalSecondaryIndexes) {
    if (existingIndexNames.has(gsi.indexName)) continue;
    console.log(`Adding missing GSI ${gsi.indexName} to ${tableName}`);
    await client.send(
      new UpdateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [...appTableAttributeDefinitions(def)],
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: gsi.indexName,
              KeySchema: [
                {
                  AttributeName: gsi.partitionKey.name,
                  KeyType: 'HASH' as const,
                },
                { AttributeName: gsi.sortKey.name, KeyType: 'RANGE' as const },
              ],
              Projection: gsiProjection(gsi),
            },
          },
        ],
      }),
    );
    await waitUntilTableExists(
      { client, maxWaitTime: 60 },
      { TableName: tableName },
    );
    existingIndexNames.add(gsi.indexName);
  }
}

async function main() {
  try {
    const described = await client.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    const existing = new Set(
      (described.Table?.GlobalSecondaryIndexes ?? [])
        .map((g) => g.IndexName)
        .filter((name): name is string => typeof name === 'string'),
    );
    console.log(`Table ${tableName} already exists`);
    await ensureMissingGsis(existing);
    await ensureTtl();
    console.log(`Table ${tableName} schema is up to date`);
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }

  try {
    await client.send(new CreateTableCommand(createTableInput()));
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err;
  }

  await waitUntilTableExists(
    { client, maxWaitTime: 30 },
    { TableName: tableName },
  );
  await ensureTtl();
  console.log(`Created table ${tableName} at ${endpoint}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
