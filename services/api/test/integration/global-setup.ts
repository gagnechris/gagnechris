import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
);

const STARTED_FLAG = path.join(
  repoRoot,
  'services/api/test/integration/.dynamodb-ci-started',
);

function applyIntegrationEnv(): void {
  process.env.AWS_ACCESS_KEY_ID = 'local';
  process.env.AWS_SECRET_ACCESS_KEY = 'local';
  process.env.AWS_SESSION_TOKEN = '';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_DEFAULT_REGION = 'us-east-1';
  delete process.env.AWS_PROFILE;
  process.env.AWS_ENDPOINT_URL_DYNAMODB =
    process.env.AWS_ENDPOINT_URL_DYNAMODB ?? 'http://127.0.0.1:8000';
  // Never inherit DATA_TABLE_NAME (e.g. gagnechris-local from env.sh).
  delete process.env.DATA_TABLE_NAME;
  process.env.COMPOSE_PROJECT_NAME =
    process.env.COMPOSE_PROJECT_NAME ?? 'gagnechris-ci';
}

async function waitForDynamo(maxAttempts = 60): Promise<void> {
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB!;
  const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      await client.send(new ListTablesCommand({}));
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`DynamoDB Local did not become ready at ${endpoint}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  applyIntegrationEnv();

  if (process.env.SKIP_DYNAMODB_INTEGRATION_SETUP === '1') {
    await waitForDynamo();
    return async () => {
      /* CI owns the compose lifecycle */
    };
  }

  let startedByUs = false;
  try {
    await waitForDynamo(3);
  } catch {
    try {
      execSync('docker compose -f docker-compose.local.yml up -d dynamodb', {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env },
      });
      startedByUs = true;
      fs.writeFileSync(STARTED_FLAG, '1', 'utf8');
    } catch (err) {
      throw new Error(
        `Failed to start DynamoDB Local via compose project ${process.env.COMPOSE_PROJECT_NAME}. ` +
          `Refusing to reuse an unknown listener on the endpoint.`,
        { cause: err },
      );
    }
    await waitForDynamo();
  }

  return async () => {
    if (!startedByUs && !fs.existsSync(STARTED_FLAG)) return;
    try {
      execSync('docker compose -f docker-compose.local.yml down', {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env },
      });
    } finally {
      try {
        fs.unlinkSync(STARTED_FLAG);
      } catch {
        /* ignore */
      }
    }
  };
}
