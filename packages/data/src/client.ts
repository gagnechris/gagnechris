import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let docClient: DynamoDBDocumentClient | undefined;

/** SDK owns throttle retries; callers only classify conflicts. */
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
