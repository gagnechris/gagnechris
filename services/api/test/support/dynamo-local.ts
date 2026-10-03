import { randomBytes } from 'node:crypto';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { APP_TABLE, appTableAttributeDefinitions } from '@gagnechris/data';
import { integrationDynamoEndpoint } from './dynamodb-ci-lifecycle.js';

export const localDynamoEndpoint = integrationDynamoEndpoint();

/** Integration tables must use this prefix so we never touch gagnechris-local. */
export const INTEGRATION_TABLE_PREFIX = 'gagnechris-it-';

export function assertIntegrationTableName(tableName: string): void {
  if (!tableName.startsWith(INTEGRATION_TABLE_PREFIX)) {
    throw new Error(
      `Refusing DynamoDB work on "${tableName}": integration tables must start with ${INTEGRATION_TABLE_PREFIX}`,
    );
  }
}

export function createLocalDynamoClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: localDynamoEndpoint,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
    },
    maxAttempts: 3,
  });
}

export function createLocalDocClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(createLocalDynamoClient(), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

function createTableInput(tableName: string) {
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

/**
 * Create an ephemeral per-file table. Ignores DATA_TABLE_NAME so sourcing
 * scripts/local/env.sh cannot point tests at gagnechris-local (CHR-151).
 */
export async function createEphemeralIntegrationTable(
  fileSlug: string,
): Promise<string> {
  const safe = fileSlug.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40);
  const tableName = `${INTEGRATION_TABLE_PREFIX}${safe}-${randomBytes(4).toString('hex')}`;
  assertIntegrationTableName(tableName);

  const client = createLocalDynamoClient();
  await client.send(new CreateTableCommand(createTableInput(tableName)));
  await waitUntilTableExists(
    { client, maxWaitTime: 60 },
    { TableName: tableName },
  );
  return tableName;
}

export async function deleteIntegrationTable(tableName: string): Promise<void> {
  assertIntegrationTableName(tableName);
  const client = createLocalDynamoClient();
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return;
    throw err;
  }
  await waitUntilTableNotExists(
    { client, maxWaitTime: 60 },
    { TableName: tableName },
  );
}

/** True if the named table currently exists (for leave-local-untouched checks). */
export async function tableExists(tableName: string): Promise<boolean> {
  const client = createLocalDynamoClient();
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return false;
    throw err;
  }
}

async function batchWriteAll(
  doc: DynamoDBDocumentClient,
  tableName: string,
  requests: Array<{ DeleteRequest: { Key: Record<string, unknown> } }>,
): Promise<void> {
  let pending = requests;
  let attempt = 0;
  while (pending.length > 0) {
    const chunk = pending.slice(0, 25);
    const result = await doc.send(
      new BatchWriteCommand({
        RequestItems: { [tableName]: chunk },
      }),
    );
    const unprocessed = result.UnprocessedItems?.[tableName] ?? [];
    pending = [...(unprocessed as typeof pending), ...pending.slice(25)];
    if (unprocessed.length > 0) {
      attempt += 1;
      if (attempt > 10) {
        throw new Error(
          `truncateTable: UnprocessedItems remained after retries on ${tableName}`,
        );
      }
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
}

/** Delete all items in an integration table (per-test isolation). */
export async function truncateTable(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<void> {
  assertIntegrationTableName(tableName);
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
        ProjectionExpression: 'pk, sk',
      }),
    );
    const keys = (page.Items ?? []).map((item) => ({
      pk: item.pk,
      sk: item.sk,
    }));
    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25);
      if (chunk.length === 0) continue;
      await batchWriteAll(
        doc,
        tableName,
        chunk.map((Key) => ({ DeleteRequest: { Key } })),
      );
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
}
