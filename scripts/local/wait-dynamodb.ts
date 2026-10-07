// Usage: tsx scripts/local/wait-dynamodb.ts [endpoint] (default: AWS_ENDPOINT_URL_DYNAMODB)
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { pathToFileURL } from 'node:url';

/** Resolves once DynamoDB Local at `endpoint` answers a ListTables call. */
export async function waitForDynamoDb(
  endpoint: string,
  { timeoutMs = 30_000, intervalMs = 250 } = {},
): Promise<void> {
  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    maxAttempts: 1,
  });
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      try {
        await client.send(new ListTablesCommand({ Limit: 1 }));
        return;
      } catch (error) {
        if (Date.now() >= deadline) {
          throw new Error(
            `DynamoDB Local did not become ready at ${endpoint}`,
            {
              cause: error,
            },
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } finally {
    client.destroy();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const endpoint = process.argv[2] ?? process.env.AWS_ENDPOINT_URL_DYNAMODB;
  if (!endpoint) {
    console.error('Pass the endpoint or set AWS_ENDPOINT_URL_DYNAMODB');
    process.exit(2);
  }
  waitForDynamoDb(endpoint).then(
    () => console.log(`DynamoDB Local is ready at ${endpoint}`),
    (error: Error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
