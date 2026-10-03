import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CI_COMPOSE_PROJECT_NAME,
  dynamodbCiStartedFlagPath,
  integrationComposeEnv,
  integrationDynamoEndpoint,
  teardownDynamodbCi,
} from './dynamodb-ci-lifecycle.js';

describe('dynamodb CI lifecycle (CHR-163)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chr163-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('forces compose project gagnechris-ci even when env.sh set COMPOSE_PROJECT_NAME', () => {
    const env = integrationComposeEnv({
      COMPOSE_PROJECT_NAME: 'gagnechris',
      PATH: '/usr/bin',
    });
    expect(env.COMPOSE_PROJECT_NAME).toBe(CI_COMPOSE_PROJECT_NAME);
    expect(CI_COMPOSE_PROJECT_NAME).toBe('gagnechris-ci');
  });

  it('targets the CI port 8001, not env.sh local dev on 8000 (CHR-199)', () => {
    expect(
      integrationDynamoEndpoint({
        AWS_ENDPOINT_URL_DYNAMODB: 'http://127.0.0.1:8000',
      }),
    ).toBe('http://127.0.0.1:8001');
    expect(
      integrationDynamoEndpoint({
        INTEGRATION_DYNAMODB_ENDPOINT: 'http://127.0.0.1:9100',
      }),
    ).toBe('http://127.0.0.1:9100');
  });

  it('stores the started flag under os.tmpdir, not the repo', () => {
    const flag = dynamodbCiStartedFlagPath(tmp);
    expect(flag.startsWith(tmp)).toBe(true);
    expect(flag).not.toContain('services/api/test/integration');
  });

  it('with env.sh project name and a stale flag does not docker down (leaves gagnechris-dynamodb-1)', () => {
    const flagPath = path.join(tmp, 'gagnechris-dynamodb-ci-started');
    fs.writeFileSync(flagPath, '1', 'utf8');
    process.env.COMPOSE_PROJECT_NAME = 'gagnechris'; // env.sh default

    const exec = vi.fn();
    const unlink = vi.fn();

    teardownDynamodbCi({
      startedByUs: false,
      repoRoot: '/repo',
      flagPath,
      exec,
      unlink,
    });

    expect(exec).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(fs.existsSync(flagPath)).toBe(true);
  });

  it('when startedByUs, downs only the gagnechris-ci project and clears the flag', () => {
    const flagPath = path.join(tmp, 'gagnechris-dynamodb-ci-started');
    fs.writeFileSync(flagPath, '1', 'utf8');
    process.env.COMPOSE_PROJECT_NAME = 'gagnechris';

    const exec = vi.fn();
    teardownDynamodbCi({
      startedByUs: true,
      repoRoot: '/repo',
      flagPath,
      exec,
      unlink: (p) => fs.unlinkSync(p),
    });

    expect(exec).toHaveBeenCalledTimes(1);
    const [cmd, opts] = exec.mock.calls[0] as [
      string,
      { env?: NodeJS.ProcessEnv },
    ];
    expect(cmd).toContain(`-p ${CI_COMPOSE_PROJECT_NAME}`);
    expect(cmd).toContain('down');
    expect(cmd).not.toMatch(/-p gagnechris[^-]/);
    expect(opts.env?.COMPOSE_PROJECT_NAME).toBe(CI_COMPOSE_PROJECT_NAME);
    expect(fs.existsSync(flagPath)).toBe(false);
  });
});
