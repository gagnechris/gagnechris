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
} from '@gagnechris/data';

const tableName = process.env.DATA_TABLE_NAME || 'gagnechris-local';
const endpoint =
  process.env.AWS_ENDPOINT_URL_DYNAMODB || 'http://127.0.0.1:8000';

if (tableName === 'gagnechris-prod') {
  console.error('Refusing to bootstrap gagnechris-prod from local scripts');
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
    GlobalSecondaryIndexes: def.globalSecondaryIndexes.map((gsi) => ({
      IndexName: gsi.indexName,
      KeySchema: [
        { AttributeName: gsi.partitionKey.name, KeyType: 'HASH' as const },
        { AttributeName: gsi.sortKey.name, KeyType: 'RANGE' as const },
      ],
      Projection: { ProjectionType: gsi.projectionType },
    })),
  };
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
                { AttributeName: gsi.partitionKey.name, KeyType: 'HASH' as const },
                { AttributeName: gsi.sortKey.name, KeyType: 'RANGE' as const },
              ],
              Projection: { ProjectionType: gsi.projectionType },
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
  console.log(`Created table ${tableName} at ${endpoint}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
