import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let docClient: DynamoDBDocumentClient | undefined;

/** SDK owns throttle retries; runDynamoWrite only classifies (CHR-126). */
const DYNAMO_MAX_ATTEMPTS = 3;

export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ maxAttempts: DYNAMO_MAX_ATTEMPTS }),
      {
        marshallOptions: { removeUndefinedValues: true },
      },
    );
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
