import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'ci', 'wait-for-job.sh');

const tmpRoots: string[] = [];
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

/** Runs the script with a `gh` that answers each call with the next state. */
function wait(states: string[], timeoutSeconds = 30) {
  const root = mkdtempSync(join(tmpdir(), 'wait-for-job-'));
  tmpRoots.push(root);
  const queue = join(root, 'states');
  const calls = join(root, 'calls');
  writeFileSync(queue, states.map((s) => `${s}\n`).join(''));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env bash
printf '%s|%s\\n' "$JOB_NAME" "$*" >> "${calls}"
head -1 "${queue}"
sed -i '1d' "${queue}"
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const result = spawnSync('bash', [SCRIPT, 'Build web and catalog (main)'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '42',
      WAIT_TIMEOUT_SECONDS: String(timeoutSeconds),
      WAIT_INTERVAL_SECONDS: '0',
    },
  });
  return {
    ...result,
    calls: readFileSync(calls, 'utf8').trim().split('\n'),
  };
}

describe('wait-for-job.sh', () => {
  it('waits until the job succeeds', () => {
    const run = wait(['queued null', 'in_progress null', 'completed success']);
    expect(run.status).toBe(0);
    expect(run.calls).toHaveLength(3);
    expect(run.calls[0]).toContain('Build web and catalog (main)|api');
    expect(run.calls[0]).toContain(
      'repos/owner/repo/actions/runs/42/jobs?filter=latest',
    );
  });

  it.each(['failure', 'cancelled', 'skipped'])(
    'fails when the job ends %s',
    (conclusion) => {
      const run = wait(['in_progress null', `completed ${conclusion}`]);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(conclusion);
    },
  );

  it('fails when the job is still running at the deadline', () => {
    const run = wait(['in_progress null', 'in_progress null'], 0);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('still');
  });
});
