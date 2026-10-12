#!/usr/bin/env npx tsx
// Requires scripts/local/env.sh sourced.
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  UpdateTableCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { APP_TABLE, appTableCreateInput, appTableName } from '@gagnechris/data';

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

const createInput = appTableCreateInput(tableName);

async function ensureTtl() {
  const def = APP_TABLE;
  // DynamoDB Local rejects UpdateTimeToLive with "TimeToLive is already
  // enabled" on a re-run, so check first.
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
  for (const gsi of createInput.GlobalSecondaryIndexes) {
    if (existingIndexNames.has(gsi.IndexName)) continue;
    console.log(`Adding missing GSI ${gsi.IndexName} to ${tableName}`);
    await client.send(
      new UpdateTableCommand({
        TableName: tableName,
        AttributeDefinitions: createInput.AttributeDefinitions,
        GlobalSecondaryIndexUpdates: [{ Create: gsi }],
      }),
    );
    await waitUntilTableExists(
      { client, maxWaitTime: 60 },
      { TableName: tableName },
    );
    existingIndexNames.add(gsi.IndexName);
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
    await client.send(new CreateTableCommand(createInput));
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
