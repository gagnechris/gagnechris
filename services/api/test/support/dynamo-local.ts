import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

export const localDynamoEndpoint =
  process.env.AWS_ENDPOINT_URL_DYNAMODB ?? 'http://127.0.0.1:8000';

export function integrationTableName(): string {
  return process.env.DATA_TABLE_NAME?.trim() || 'gagnechris-test';
}

export function createLocalDocClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: localDynamoEndpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
      },
      maxAttempts: 3,
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
}

/** Delete all items in the table (integration isolation). */
export async function truncateTable(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<void> {
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
      await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
          },
        }),
      );
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
}
