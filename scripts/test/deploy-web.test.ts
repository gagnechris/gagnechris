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

/** The generated list `npm run publish-surface:check` keeps in step with the publisher targets. */
function publisherOwnedPaths(): string[] {
  return readFileSync(
    join(ROOT, 'scripts', 'publisher-owned-paths.generated.txt'),
    'utf8',
  )
    .split('\n')
    .filter((line) => line && !line.startsWith('#'));
}

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
type Stub = {
  /** The apex bucket's index.html: there, missing (404) or unreadable (403). */
  index?: 'present' | 'missing' | 'denied';
  /** An SSM parameter whose read fails. */
  ssmFails?: string;
  functionError?: string;
  mode?: 'cognito-env' | 'build' | 'upload';
  env?: Record<string, string>;
  /** A build already in apps/web, as the upload job downloads it. */
  prebuilt?: boolean;
};

// CI sets placeholder VITE_COGNITO_* values for the whole job; each test
// supplies its own.
const inheritedEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('VITE_COGNITO_'),
    ),
  );

function runDeploy(stub: Stub = {}) {
  const root = tempDir('deploy-web-');
  mkdirSync(join(root, 'scripts'));
  for (const file of [
    'deploy-web.sh',
    'ssm-param-name.sh',
    'publisher-owned-paths.generated.txt',
  ]) {
    copyFileSync(join(ROOT, 'scripts', file), join(root, 'scripts', file));
  }
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
      if [ "\${!i}" = "--name" ]; then
        j=$((i + 1)); name="$(basename "\${!j}")"
        if [ "$name" = "${stub.ssmFails ?? ''}" ]; then
          echo "An error occurred (ThrottlingException) when calling the GetParameter operation: Rate exceeded" >&2
          exit 254
        fi
        echo "$name"
      fi
    done ;;
  "s3api head-object")
    case "${stub.index ?? 'present'}" in
      missing) echo "An error occurred (404) when calling the HeadObject operation: Not Found" >&2; exit 254 ;;
      denied) echo "An error occurred (403) when calling the HeadObject operation: Forbidden" >&2; exit 254 ;;
    esac ;;
  "cloudfront create-invalidation") echo I123 ;;
  "lambda invoke") echo '{}' > "\${!#}"; echo ${stub.functionError ?? 'None'} ;;
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
  mkdir -p "$web/dist/fonts"; touch "$web/dist/fonts/serif.0123abcd.woff2" "$web/dist/fonts/OFL.txt"
fi
`,
  );

  if (stub.prebuilt) {
    const web = join(root, 'apps', 'web');
    for (const d of ['dist', 'dist-admin', 'dist-notebook']) {
      write(join(web, d, 'index.html'), '');
      write(join(web, d, 'assets', 'x.js'), '');
    }
    write(join(web, 'dist', '_shell.html'), '');
  }

  const result = spawnSync(
    'bash',
    [join(root, 'scripts', 'deploy-web.sh'), ...(stub.mode ? [stub.mode] : [])],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...inheritedEnv(),
        PATH: `${bin}:${process.env.PATH}`,
        ENV_NAME: 'prod',
        ...stub.env,
      },
    },
  );
  const calls = existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(SEP))
    : [];
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls,
    root,
  };
}

const isSync = (c: string[]) =>
  c[0] === 'aws' && c[1] === 's3' && c[2] === 'sync';
const syncTo = (calls: string[][], target: string) =>
  calls.filter((c) => isSync(c) && c[4] === target);
const excludes = (c: string[]) =>
  c.flatMap((a, i) => (c[i - 1] === '--exclude' ? [a] : []));
const cacheControl = (c: string[]) => c[c.indexOf('--cache-control') + 1];

// aws s3 sync globs: `*` also matches `/`.
const glob = (pattern: string) =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
  );

/** Whether a sync to `bucket` touches `key`: the last matching --exclude/--include wins. */
function syncCovers(sync: string[], bucket: string, key: string): boolean {
  const prefix = `s3://${bucket}/`;
  if (!sync[4]!.startsWith(prefix)) return false;
  const dir = sync[4]!.slice(prefix.length);
  if (!key.startsWith(dir)) return false;
  const rel = key.slice(dir.length);
  let included = true;
  sync.forEach((arg, i) => {
    if (sync[i - 1] === '--exclude' && glob(arg).test(rel)) included = false;
    if (sync[i - 1] === '--include' && glob(arg).test(rel)) included = true;
  });
  return included;
}

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

  it('keeps publisher output out of the apex --delete and deletes everything else the build lacks', () => {
    const apex = syncTo(ok.calls, 's3://site-bucket-name/');
    expect(apex).toHaveLength(1);
    expect(apex[0]).toContain('--delete');
    expect(apex[0]).not.toContain('--dryrun');
    const patterns = excludes(apex[0]!);
    expect(patterns.sort()).toEqual(
      [
        '.vite/*',
        'assets/*',
        'fonts/*.woff2',
        'media/*',
        ...publisherOwnedPaths(),
      ].sort(),
    );
    const excluded = (key: string) => patterns.some((p) => glob(p).test(key));
    for (const key of [
      'spa.html',
      'manifest.json',
      'icons/apple-touch-icon.png',
      'icons/icon-192.png',
      'notebook/x.png',
    ]) {
      expect(excluded(key), key).toBe(false);
    }
    for (const key of [
      'blog/posts.json',
      'blog/hello/index.html',
      'projects/index.html',
      'projects/notebook/index.html',
      'resume/index.html',
      'resume.pdf',
      'home/last-published.json',
      'media/x.png',
      'rss.xml',
      'sitemap.xml',
      '.vite/manifest.json',
    ]) {
      expect(excluded(key), key).toBe(true);
    }
  });

  it('uploads every public font as immutable before the HTML, and never deletes an old version', () => {
    const syncs = ok.calls.filter(isSync);
    const html = syncTo(ok.calls, 's3://site-bucket-name/')[0]!;
    for (const key of [
      'fonts/serif.0123abcd.woff2',
      'fonts/a-font-from-an-earlier-build.89abcdef.woff2',
    ]) {
      const covering = syncs.filter((c) =>
        syncCovers(c, 'site-bucket-name', key),
      );
      expect(covering.length, key).toBeGreaterThan(0);
      for (const sync of covering) {
        expect(cacheControl(sync), key).toBe(
          'public,max-age=31536000,immutable',
        );
        expect(sync, key).not.toContain('--delete');
        expect(ok.calls.indexOf(sync)).toBeLessThan(ok.calls.indexOf(html));
      }
    }
    const licence = syncs.filter((c) =>
      syncCovers(c, 'site-bucket-name', 'fonts/OFL.txt'),
    );
    expect(licence.map(cacheControl)).toEqual([
      'public,max-age=0,must-revalidate',
    ]);
  });

  it('keeps the published home page: index.html is neither synced nor uploaded over', () => {
    const apex = syncTo(ok.calls, 's3://site-bucket-name/')[0]!;
    expect(syncCovers(apex, 'site-bucket-name', 'index.html')).toBe(false);
    expect(
      ok.calls.some((c) => c.includes('s3://site-bucket-name/index.html')),
    ).toBe(false);
  });

  it('republishes after the apex upload and checks the result', () => {
    const invoke = ok.calls.find((c) => c[1] === 'lambda');
    expect(invoke?.[invoke.indexOf('--function-name') + 1]).toBe(
      'publisher-function-name',
    );
    expect(ok.calls.indexOf(invoke!)).toBeGreaterThan(
      ok.calls.indexOf(syncTo(ok.calls, 's3://site-bucket-name/')[0]!),
    );
  });

  it('syncs the apex without a dry run or legacy shell check first', () => {
    expect(ok.calls.some((c) => c.includes('--dryrun'))).toBe(false);
    expect(
      ok.calls.some((c) => c.join(' ').includes('legacy-admin-plan')),
    ).toBe(false);
  });
});

describe('deploy-web.sh home page and republish', () => {
  it('seeds index.html into a bucket that has no home page yet', () => {
    const run = runDeploy({ index: 'missing' });
    expect(run.status, run.stderr).toBe(0);
    const seed = run.calls.find(
      (c) => c[2] === 'cp' && c[4] === 's3://site-bucket-name/index.html',
    );
    expect(seed?.[3]).toMatch(/apps\/web\/dist\/index\.html$/);
  });

  it('fails when it cannot tell whether the home page exists', () => {
    const run = runDeploy({ index: 'denied' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/403/);
    expect(run.calls.some((c) => c[1] === 'lambda')).toBe(false);
  });

  it('fails before uploading anything when the publisher name cannot be read', () => {
    const run = runDeploy({ ssmFails: 'publisher-function-name' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/ThrottlingException/);
    expect(run.calls.some((c) => c[0] === 'npm')).toBe(false);
    expect(run.calls.some((c) => c[1] === 's3')).toBe(false);
  });

  it('fails when republish-all throws', () => {
    const run = runDeploy({ functionError: 'Unhandled' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/FunctionError=Unhandled/);
  });
});

describe('deploy-web.sh split across the build and deploy jobs', () => {
  // The stub's SSM values are the parameters' leaf names.
  const ssmCognito = {
    VITE_COGNITO_USER_POOL_ID: 'cognito-user-pool-id',
    VITE_COGNITO_ADMIN_CLIENT_ID: 'cognito-admin-web-client-id',
    VITE_COGNITO_NOTEBOOK_CLIENT_ID: 'cognito-notebook-web-client-id',
    VITE_COGNITO_AUTH_DOMAIN: 'cognito-auth-domain',
  };

  it('prints the Cognito settings the build needs, and nothing else', () => {
    const run = runDeploy({ mode: 'cognito-env' });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim().split('\n')).toEqual(
      Object.entries(ssmCognito).map(([k, v]) => `${k}=${v}`),
    );
    expect(run.calls.some((c) => c[0] === 'npm')).toBe(false);
  });

  it('builds with the given Cognito settings and no AWS call', () => {
    const run = runDeploy({
      mode: 'build',
      env: { ...ssmCognito, VITE_COGNITO_ADMIN_CLIENT_ID: 'from-plan' },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.calls.some((c) => c[0] === 'aws')).toBe(false);
    const npm = run.calls.filter((c) => c[0] === 'npm');
    expect(npm[0]).toContain('admin=from-plan');
    expect(npm[1]!.slice(1, 4)).toEqual([
      'run',
      '--silent',
      'check:web-shells',
    ]);
  });

  it('uploads an existing build without running npm', () => {
    const run = runDeploy({ mode: 'upload', env: ssmCognito, prebuilt: true });
    expect(run.status, run.stderr).toBe(0);
    expect(run.calls.some((c) => c[0] === 'npm')).toBe(false);
    expect(syncTo(run.calls, 's3://site-bucket-name/')).toHaveLength(1);
    expect(run.calls.some((c) => c[1] === 'lambda')).toBe(true);
  });

  it('refuses to upload a build made with Cognito settings SSM no longer has', () => {
    const run = runDeploy({
      mode: 'upload',
      env: { ...ssmCognito, VITE_COGNITO_NOTEBOOK_CLIENT_ID: 'replaced' },
      prebuilt: true,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/VITE_COGNITO_NOTEBOOK_CLIENT_ID changed/);
    expect(run.calls.some((c) => c[1] === 's3')).toBe(false);
  });

  it('refuses to upload when it does not know what the build used', () => {
    const run = runDeploy({ mode: 'upload', prebuilt: true });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/upload needs VITE_COGNITO_USER_POOL_ID/);
    expect(run.calls.some((c) => c[1] === 's3')).toBe(false);
  });
});
