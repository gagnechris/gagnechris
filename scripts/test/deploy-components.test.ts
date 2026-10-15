import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
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
const SEP = '\u001f';

const tmpRoots: string[] = [];
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

function executable(file: string, body: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

/** Runs deploy-components.sh in a scratch repo layout with `aws` and `npm` stubbed. */
function runDeploy(build: 'ok' | 'empty' = 'ok') {
  const root = mkdtempSync(join(tmpdir(), 'deploy-components-'));
  tmpRoots.push(root);
  mkdirSync(join(root, 'scripts'));
  for (const file of ['deploy-components.sh', 'ssm-param-name.sh']) {
    copyFileSync(join(ROOT, 'scripts', file), join(root, 'scripts', file));
  }
  mkdirSync(join(root, 'infra', 'lib', 'config'), { recursive: true });
  copyFileSync(
    join(ROOT, 'infra', 'lib', 'config', 'ssm-params.json'),
    join(root, 'infra', 'lib', 'config', 'ssm-params.json'),
  );
  const log = join(root, 'calls.log');
  const bin = join(root, 'bin');
  executable(
    join(bin, 'aws'),
    `#!/usr/bin/env bash
(IFS='${SEP}'; printf 'aws${SEP}%s\\n' "$*") >> "${log}"
if [ "$1 $2" = "ssm get-parameter" ]; then
  for ((i = 1; i <= $#; i++)); do
    if [ "\${!i}" = "--name" ]; then j=$((i + 1)); basename "\${!j}"; fi
  done
fi
exit 0
`,
  );
  const out = join(root, 'apps', 'storybook', 'storybook-static');
  executable(
    join(bin, 'npm'),
    `#!/usr/bin/env bash
(IFS='${SEP}'; printf 'npm${SEP}%s\\n' "$*") >> "${log}"
mkdir -p "${out}/assets"
${build === 'ok' ? `touch "${out}/index.html" "${out}/assets/x.js"` : ''}
`,
  );
  const result = spawnSync(
    'bash',
    [join(root, 'scripts', 'deploy-components.sh')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    },
  );
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(SEP))
    : [];
  return { status: result.status, stderr: result.stderr, calls };
}

describe('deploy-components.sh', () => {
  const ok = runDeploy();
  const syncs = ok.calls.filter(
    (c) => c[0] === 'aws' && c[1] === 's3' && c[2] === 'sync',
  );

  it('builds Storybook, then syncs to the bucket from SSM and invalidates', () => {
    expect(ok.status).toBe(0);
    expect(ok.calls.find((c) => c[0] === 'npm')).toEqual([
      'npm',
      'run',
      'storybook:build',
    ]);
    expect(syncs.map((c) => c[4])).toEqual([
      's3://components-bucket-name/assets/',
      's3://components-bucket-name/',
    ]);
    const last = ok.calls.at(-1)!;
    expect(last.slice(1, 3)).toEqual(['cloudfront', 'create-invalidation']);
    expect(last[last.indexOf('--distribution-id') + 1]).toBe(
      'components-cloudfront-distribution-id',
    );
  });

  it('keeps old hashed assets and deletes every other stale file', () => {
    const [assets, rest] = syncs;
    expect(assets).not.toContain('--delete');
    expect(assets![assets!.indexOf('--cache-control') + 1]).toBe(
      'public,max-age=31536000,immutable',
    );
    expect(rest).toContain('--delete');
    expect(rest![rest!.indexOf('--exclude') + 1]).toBe('assets/*');
    expect(rest![rest!.indexOf('--cache-control') + 1]).toBe(
      'public,max-age=0,must-revalidate',
    );
  });

  it('uploads nothing when the build produced no index.html', () => {
    const empty = runDeploy('empty');
    expect(empty.status).toBe(1);
    expect(empty.stderr).toMatch(/Missing build output/);
    expect(empty.calls.some((c) => c[1] === 's3')).toBe(false);
  });
});
