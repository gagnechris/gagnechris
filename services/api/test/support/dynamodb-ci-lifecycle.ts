import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Compose project for API integration tests — never the local-dev `gagnechris`. */
export const CI_COMPOSE_PROJECT_NAME = 'gagnechris-ci' as const;

/** Flag that this process started DynamoDB Local (lives in os.tmpdir, not the repo). */
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

/**
 * Tear down the CI DynamoDB compose project only when this run started it.
 * A stale flag (or env.sh's COMPOSE_PROJECT_NAME=gagnechris) must never stop
 * `gagnechris-dynamodb-1`.
 */
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
      `docker compose -p ${CI_COMPOSE_PROJECT_NAME} -f docker-compose.local.yml down`,
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
