import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Never the local-dev `gagnechris` project. */
export const CI_COMPOSE_PROJECT_NAME = 'gagnechris-ci' as const;

export const CI_COMPOSE_FILES = [
  'docker-compose.local.yml',
  'docker-compose.ci.yml',
] as const;

/** Local dev keeps 8000. */
export const INTEGRATION_DYNAMODB_HOST_PORT = 8001;

/**
 * Deliberately ignores an inherited AWS_ENDPOINT_URL_DYNAMODB (env.sh points
 * that at local dev on 8000); override with INTEGRATION_DYNAMODB_ENDPOINT.
 */
export function integrationDynamoEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.INTEGRATION_DYNAMODB_ENDPOINT ??
    `http://127.0.0.1:${INTEGRATION_DYNAMODB_HOST_PORT}`
  );
}

export function ciComposeFileArgs(): string {
  return CI_COMPOSE_FILES.map((f) => `-f ${f}`).join(' ');
}

export function dynamodbCiStartedFlagPath(
  tmpDir: string = os.tmpdir(),
): string {
  return path.join(tmpDir, 'gagnechris-dynamodb-ci-started');
}

export function integrationComposeEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    COMPOSE_PROJECT_NAME: CI_COMPOSE_PROJECT_NAME,
  };
}

export type ComposeExec = (
  command: string,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: string },
) => void;

/** A stale flag (or env.sh's COMPOSE_PROJECT_NAME=gagnechris) must never stop `gagnechris-dynamodb-1`. */
export function teardownDynamodbCi(opts: {
  startedByUs: boolean;
  repoRoot: string;
  flagPath?: string;
  exec?: ComposeExec;
  unlink?: (p: string) => void;
}): void {
  const flagPath = opts.flagPath ?? dynamodbCiStartedFlagPath();
  if (!opts.startedByUs) {
    return;
  }
  const run =
    opts.exec ??
    ((command, options) => {
      execSync(command, {
        cwd: options?.cwd,
        stdio: 'inherit',
        env: options?.env,
      });
    });
  try {
    run(
      `docker compose -p ${CI_COMPOSE_PROJECT_NAME} ${ciComposeFileArgs()} down`,
      {
        cwd: opts.repoRoot,
        stdio: 'inherit',
        env: integrationComposeEnv(process.env),
      },
    );
  } finally {
    const unlink =
      opts.unlink ??
      ((p: string) => {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      });
    unlink(flagPath);
  }
}
