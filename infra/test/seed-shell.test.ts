import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

function write(file: string, body = 'x'): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

describe('scripts/local/seed-shell.sh', () => {
  it('replaces the shell but keeps every publisher-owned key', () => {
    const root = mkdtempSync(join(tmpdir(), 'seed-shell-'));
    roots.push(root);
    for (const file of [
      'scripts/local/seed-shell.sh',
      'scripts/local/env.sh',
      'scripts/publisher-owned-paths.generated.txt',
    ]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(ROOT, file), join(root, file));
    }
    write(join(root, 'apps/web/dist/index.html'), 'new shell');
    write(join(root, 'apps/web/dist/_shell.html'), 'new shell');
    const site = join(root, '.local-site');
    const published = [
      'blog/hello/index.html',
      'blog/posts.json',
      'projects/notebook/index.html',
      'resume/index.html',
      'resume.pdf',
      'home/last-published.json',
      'rss.xml',
      'sitemap.xml',
    ];
    for (const key of [...published, 'stale.html']) write(join(site, key));

    const result = spawnSync(
      'bash',
      [join(root, 'scripts/local/seed-shell.sh')],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: root },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    for (const key of published) {
      expect(existsSync(join(site, key)), key).toBe(true);
    }
    expect(existsSync(join(site, 'stale.html'))).toBe(false);
    expect(existsSync(join(site, '_shell.html'))).toBe(true);
  });
});
