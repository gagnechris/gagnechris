/**
 * Shared DynamoDB single-table client config.
 * Posts and Notebook both use DATA_TABLE_NAME; entity prefixes keep them apart
 * (see docs/data-model.md).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let docClient: DynamoDBDocumentClient | undefined;

export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

/** Override for tests. */
export function setDocClient(client: DynamoDBDocumentClient | undefined): void {
  docClient = client;
}

export function requireTableName(): string {
  const name = process.env.DATA_TABLE_NAME?.trim();
  if (!name) {
    throw new Error('DATA_TABLE_NAME is not set');
  }
  return name;
}
