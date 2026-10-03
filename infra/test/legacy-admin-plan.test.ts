import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = join(ROOT, 'scripts', 'check-legacy-admin-plan.ts');
const BUCKET = 'site-bucket';

const tmpRoots: string[] = [];
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

/** Shaped like a real Vite 8 legacy build: entry, preload map, lazy chunks, CSS, PWA files. */
const LEGACY_BUCKET: Record<string, string> = {
  'spa.html': `<!doctype html><html><head>
<link rel="icon" type="image/svg+xml" href="/cg-icon.svg" />
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="alternate" type="application/rss+xml" href="/rss.xml" />
<script type="module" crossorigin src="/assets/index-AAAA1111.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-BBBB2222.css">
</head><body><div id="root"></div></body></html>`,
  'assets/index-AAAA1111.js': `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/AdminLayout-CCCC3333.js","assets/AdminLayout-DDDD4444.css"])))=>i.map(i=>d[i]);
import{r as e}from"./vendor-EEEE5555.js";const t=()=>e(()=>import("./AdminLayout-CCCC3333.js"),__vite__mapDeps([0,1]));`,
  'assets/vendor-EEEE5555.js': 'export const r=(f)=>f();',
  'assets/AdminLayout-CCCC3333.js': `const p=()=>import("./AdminNotebookTodayPage-FFFF6666.js");export{p};`,
  'assets/AdminNotebookTodayPage-FFFF6666.js': 'export default 1;',
  'assets/AdminLayout-DDDD4444.css':
    '.a{background:url(/assets/paws-GGGG7777.svg)}',
  'assets/paws-GGGG7777.svg': '<svg/>',
  'assets/index-BBBB2222.css': '@font-face{src:url(./font-HHHH8888.woff2)}',
  'assets/font-HHHH8888.woff2': 'woff2',
  'manifest.json': JSON.stringify({
    start_url: '/admin/notebook',
    icons: [{ src: '/icons/icon-192.png' }, { src: '/icons/icon-512.png' }],
  }),
  'icons/apple-touch-icon.png': 'png',
  'icons/icon-192.png': 'png',
  'icons/icon-512.png': 'png',
  'cg-icon.svg': '<svg/>',
  'rss.xml': '<rss/>',
  'index.html': '<html>public</html>',
  'old-page/index.html': '<html>old</html>',
};

function check(
  plan: string[],
  bucket: Record<string, string | null> = {},
): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'legacy-admin-'));
  tmpRoots.push(dir);
  for (const [key, body] of Object.entries({ ...LEGACY_BUCKET, ...bucket })) {
    if (body === null) continue;
    mkdirSync(dirname(join(dir, 'bucket', key)), { recursive: true });
    writeFileSync(join(dir, 'bucket', key), body);
  }
  const planFile = join(dir, 'plan.txt');
  writeFileSync(planFile, plan.join('\n'));
  const result = spawnSync(
    TSX,
    [
      SCRIPT,
      '--plan',
      planFile,
      '--bucket',
      BUCKET,
      '--dir',
      join(dir, 'bucket'),
    ],
    { encoding: 'utf8' },
  );
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const upload = (key: string) =>
  `(dryrun) upload: apps/web/dist/${key} to s3://${BUCKET}/${key}`;
const remove = (key: string) => `(dryrun) delete: s3://${BUCKET}/${key}`;

describe('check-legacy-admin-plan', () => {
  it('passes a plan that only replaces public pages', () => {
    const r = check([
      upload('index.html'),
      upload('cg-icon.svg'),
      remove('old-page/index.html'),
    ]);
    expect(r.out).toMatch(/Legacy \/admin shell intact: 15 referenced files/);
    expect(r.status).toBe(0);
  });

  it.each([
    'assets/AdminNotebookTodayPage-FFFF6666.js',
    'assets/vendor-EEEE5555.js',
    'assets/paws-GGGG7777.svg',
    'assets/font-HHHH8888.woff2',
    'manifest.json',
    'icons/icon-512.png',
    'icons/apple-touch-icon.png',
    'spa.html',
  ])('refuses a plan that deletes %s', (key) => {
    const r = check([upload('index.html'), remove(key)]);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`the sync would delete ${key}`);
  });

  it('refuses a plan that overwrites spa.html', () => {
    const r = check([upload('spa.html')]);
    expect(r.status).toBe(1);
    expect(r.out).toContain('the sync would overwrite spa.html');
  });

  it('refuses when a file the shell loads is already gone', () => {
    const r = check([upload('index.html')], {
      'assets/AdminNotebookTodayPage-FFFF6666.js': null,
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      'assets/AdminNotebookTodayPage-FFFF6666.js is already missing',
    );
  });

  it('refuses when the legacy shell itself is missing', () => {
    const r = check([upload('index.html')], { 'spa.html': null });
    expect(r.status).toBe(1);
    expect(r.out).toContain('spa.html is already missing');
  });
});
