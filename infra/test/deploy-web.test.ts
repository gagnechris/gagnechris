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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpRoots.push(dir);
  return dir;
}

function write(file: string, body: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function executable(file: string, body: string): void {
  write(file, body);
  chmodSync(file, 0o755);
}

/**
 * Runs deploy-web.sh from a scratch copy of the repo layout with `aws` and
 * `npm` stubbed, recording every call in order.
 */
function runDeploy(opts: { guardExit?: number } = {}) {
  const root = tempDir('deploy-web-');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(
    join(ROOT, 'scripts', 'deploy-web.sh'),
    join(root, 'scripts', 'deploy-web.sh'),
  );
  write(
    join(root, 'infra', 'lib', 'config', 'ssm-params.json'),
    readFileSync(
      join(ROOT, 'infra', 'lib', 'config', 'ssm-params.json'),
      'utf8',
    ),
  );
  const log = join(root, 'calls.log');
  const bin = join(root, 'bin');

  // SSM values are the parameter's leaf name, so assertions can tell them apart.
  executable(
    join(bin, 'aws'),
    `#!/usr/bin/env bash
(IFS='${SEP}'; printf 'aws${SEP}%s\\n' "$*") >> "${log}"
case "$1 $2" in
  "ssm get-parameter")
    for ((i = 1; i <= $#; i++)); do
      if [ "\${!i}" = "--name" ]; then j=$((i + 1)); basename "\${!j}"; fi
    done ;;
  "s3 sync")
    for arg in "$@"; do
      [ "$arg" = "--dryrun" ] && printf '%s' "\${FAKE_DRYRUN:-}"
    done ;;
  "cloudfront create-invalidation") echo I123 ;;
  "lambda invoke") echo '{}' > "\${!#}"; echo None ;;
esac
exit 0
`,
  );
  executable(
    join(bin, 'npm'),
    `#!/usr/bin/env bash
(IFS='${SEP}'; printf 'npm${SEP}%s${SEP}admin=%s${SEP}notebook=%s\\n' "$*" "\${VITE_COGNITO_ADMIN_CLIENT_ID:-}" "\${VITE_COGNITO_NOTEBOOK_CLIENT_ID:-}") >> "${log}"
if [ "$1 $2" = "run build" ]; then
  web="${root}/apps/web"
  for d in dist dist-admin dist-notebook; do mkdir -p "$web/$d/assets"; touch "$web/$d/index.html" "$web/$d/assets/x.js"; done
  touch "$web/dist/_shell.html" "$web/dist-notebook/manifest.json"
fi
case "$*" in
  *check:legacy-admin-plan*) exit "\${FAKE_GUARD_EXIT:-0}" ;;
esac
`,
  );

  const result = spawnSync('bash', [join(root, 'scripts', 'deploy-web.sh')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      ENV_NAME: 'prod',
      FAKE_GUARD_EXIT: String(opts.guardExit ?? 0),
      FAKE_DRYRUN: '(dryrun) upload: dist/index.html to s3://site/index.html\n',
    },
  });
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(SEP))
    : [];
  return { status: result.status, stderr: result.stderr, calls, root };
}

const isSync = (c: string[]) =>
  c[0] === 'aws' && c[1] === 's3' && c[2] === 'sync';
const syncTo = (calls: string[][], target: string) =>
  calls.filter((c) => isSync(c) && c[4] === target);
const excludes = (c: string[]) =>
  c.flatMap((a, i) => (c[i - 1] === '--exclude' ? [a] : []));

describe('deploy-web.sh', () => {
  const ok = runDeploy();

  it('succeeds with stubbed AWS', () => {
    expect(ok.stderr).not.toMatch(/Missing build output/);
    expect(ok.status).toBe(0);
  });

  it('builds every app with its own Cognito client from SSM, then checks the shells', () => {
    const npm = ok.calls.filter((c) => c[0] === 'npm');
    expect(npm[0]).toEqual([
      'npm',
      'run',
      'build',
      '-w',
      '@gagnechris/web',
      'admin=cognito-admin-web-client-id',
      'notebook=cognito-notebook-web-client-id',
    ]);
    expect(npm[1]!.slice(1, 4)).toEqual([
      'run',
      '--silent',
      'check:web-shells',
    ]);
    const firstUpload = ok.calls.findIndex(
      (c) => c[0] === 'aws' && c[1] === 's3',
    );
    expect(ok.calls.indexOf(npm[1]!)).toBeLessThan(firstUpload);
  });

  it.each([
    ['admin', 'admin-site-bucket-name', 'admin-cloudfront-distribution-id'],
    [
      'notebook',
      'notebook-site-bucket-name',
      'notebook-cloudfront-distribution-id',
    ],
  ])(
    'ships dist-%s to its own bucket and invalidates its distribution',
    (app, bucket, distribution) => {
      const [assets, site] = [
        syncTo(ok.calls, `s3://${bucket}/assets/`),
        syncTo(ok.calls, `s3://${bucket}/`),
      ];
      expect(assets).toHaveLength(1);
      expect(assets[0]![3]).toMatch(
        new RegExp(`apps/web/dist-${app}/assets/$`),
      );
      expect(site).toHaveLength(1);
      expect(site[0]![3]).toMatch(new RegExp(`apps/web/dist-${app}/$`));
      expect(site[0]).toContain('--delete');
      expect(excludes(site[0]!)).toEqual(['assets/*']);
      expect(ok.calls.indexOf(assets[0]!)).toBeLessThan(
        ok.calls.indexOf(site[0]!),
      );
      expect(
        ok.calls.some(
          (c) =>
            c[1] === 'cloudfront' &&
            c[c.indexOf('--distribution-id') + 1] === distribution,
        ),
      ).toBe(true);
    },
  );

  it('serves the Notebook manifest as a web app manifest', () => {
    const cp = ok.calls.find(
      (c) =>
        c[2] === 'cp' &&
        c[4] === 's3://notebook-site-bucket-name/manifest.json',
    );
    expect(cp?.[cp.indexOf('--content-type') + 1]).toBe(
      'application/manifest+json',
    );
  });

  it('never deletes hashed assets on any host', () => {
    for (const sync of ok.calls.filter(isSync)) {
      if (sync[4]!.endsWith('/assets/')) expect(sync).not.toContain('--delete');
      else if (sync.includes('--delete'))
        expect(excludes(sync)).toContain('assets/*');
    }
  });

  it('keeps the legacy /admin shell, its PWA files and publisher output out of the apex --delete', () => {
    const apex = syncTo(ok.calls, 's3://site-bucket-name/').filter(
      (c) => !c.includes('--dryrun'),
    );
    expect(apex).toHaveLength(1);
    expect(apex[0]).toContain('--delete');
    expect(excludes(apex[0]!)).toEqual(
      expect.arrayContaining([
        'assets/*',
        'spa.html',
        'manifest.json',
        'icons/*',
        'blog/*',
        'resume/*',
        'resume.pdf',
        'home/*',
        'media/*',
        'notebook/*',
        'sitemap.xml',
        'rss.xml',
      ]),
    );
  });

  it('checks a dry run of exactly the apex sync before running it', () => {
    const apex = syncTo(ok.calls, 's3://site-bucket-name/');
    const dryrun = apex.find((c) => c.includes('--dryrun'))!;
    const real = apex.find((c) => !c.includes('--dryrun'))!;
    expect(dryrun.filter((a) => a !== '--dryrun')).toEqual(real);
    const guard = ok.calls.find((c) =>
      c.join(' ').includes('check:legacy-admin-plan'),
    )!;
    expect(guard).toContain('--bucket');
    expect(guard[guard.indexOf('--bucket') + 1]).toBe('site-bucket-name');
    const order = [dryrun, guard, real].map((c) => ok.calls.indexOf(c));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('stops before touching the apex when the legacy shell check fails', () => {
    const failed = runDeploy({ guardExit: 1 });
    expect(failed.status).not.toBe(0);
    const apex = syncTo(failed.calls, 's3://site-bucket-name/');
    expect(apex.every((c) => c.includes('--dryrun'))).toBe(true);
    expect(
      failed.calls.some(
        (c) =>
          c[1] === 'cloudfront' &&
          c[c.indexOf('--distribution-id') + 1] ===
            'cloudfront-distribution-id',
      ),
    ).toBe(false);
    expect(failed.calls.some((c) => c[1] === 'lambda')).toBe(false);
  });
});
