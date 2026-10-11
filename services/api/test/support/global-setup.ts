import { execSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CI_COMPOSE_PROJECT_NAME,
  ciComposeFileArgs,
  dynamodbCiStartedFlagPath,
  integrationComposeEnv,
  integrationDynamoEndpoint,
  teardownDynamodbCi,
} from './dynamodb-ci-lifecycle.js';
import { waitForDynamoDb } from '../../../../scripts/local/wait-dynamodb.js';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../../..', import.meta.url)),
);

function applyIntegrationEnv(): void {
  process.env.AWS_ACCESS_KEY_ID = 'local';
  process.env.AWS_SECRET_ACCESS_KEY = 'local';
  process.env.AWS_SESSION_TOKEN = '';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_DEFAULT_REGION = 'us-east-1';
  delete process.env.AWS_PROFILE;
  // Never the local-dev DynamoDB on 8000.
  process.env.AWS_ENDPOINT_URL_DYNAMODB = integrationDynamoEndpoint();
  // Never inherit DATA_TABLE_NAME (e.g. gagnechris-local from env.sh).
  delete process.env.DATA_TABLE_NAME;
  // Always isolate from `env.sh`'s COMPOSE_PROJECT_NAME=gagnechris.
  process.env.COMPOSE_PROJECT_NAME = CI_COMPOSE_PROJECT_NAME;
}

// One build for every test file: each file starts its own server.
function buildGoApi(): () => void {
  if (process.env.GO_API_BIN) return () => {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gagnechris-go-api-'));
  const bin = path.join(dir, 'api');
  execSync(`go -C services/api build -o ${JSON.stringify(bin)} ./cmd/api`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  process.env.GO_API_BIN = bin;
  return () => fs.rmSync(dir, { recursive: true, force: true });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  applyIntegrationEnv();
  const removeGoApi = buildGoApi();

  if (process.env.SKIP_DYNAMODB_INTEGRATION_SETUP === '1') {
    await waitForDynamoDb(process.env.AWS_ENDPOINT_URL_DYNAMODB!);
    // CI owns the compose lifecycle.
    return async () => removeGoApi();
  }

  const flagPath = dynamodbCiStartedFlagPath();
  let startedByUs = false;
  try {
    await waitForDynamoDb(process.env.AWS_ENDPOINT_URL_DYNAMODB!, {
      timeoutMs: 1_000,
    });
  } catch {
    try {
      execSync(
        `docker compose -p ${CI_COMPOSE_PROJECT_NAME} ${ciComposeFileArgs()} up -d dynamodb`,
        {
          cwd: repoRoot,
          stdio: 'inherit',
          env: integrationComposeEnv(process.env),
        },
      );
      startedByUs = true;
      fs.mkdirSync(path.dirname(flagPath), { recursive: true });
      fs.writeFileSync(flagPath, '1', 'utf8');
    } catch (err) {
      throw new Error(
        `Failed to start DynamoDB Local via compose project ${CI_COMPOSE_PROJECT_NAME}. ` +
          `Refusing to reuse an unknown listener on the endpoint.`,
        { cause: err },
      );
    }
    await waitForDynamoDb(process.env.AWS_ENDPOINT_URL_DYNAMODB!);
  }

  return async () => {
    removeGoApi();
    teardownDynamodbCi({
      startedByUs,
      repoRoot,
      flagPath,
      exec: (command, options) => {
        execSync(command, {
          cwd: options?.cwd,
          stdio: 'inherit',
          env: options?.env,
        });
      },
    });
  };
}
