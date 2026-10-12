import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-case-collisions.mjs');

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function repoWithIndex(paths: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'case-collisions-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, 'blob'), '');
  const blob = execFileSync('git', ['hash-object', '-w', 'blob'], {
    cwd: dir,
    encoding: 'utf8',
  }).trim();
  // Index entries, not files, so case-only twins fit on a case-insensitive disk.
  for (const path of paths) {
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`],
      { cwd: dir },
    );
  }
  return dir;
}

function check(cwd: string) {
  return spawnSync('node', [SCRIPT], { cwd, encoding: 'utf8' });
}

describe('check-case-collisions', () => {
  it('finds no case collisions in this repo', () => {
    const result = check(ROOT);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('fails on module paths that differ only by case and extension', () => {
    const result = check(
      repoWithIndex(['src/taskMentions.ts', 'src/TaskMentions.tsx']),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/TaskMentions  vs  src/taskMentions');
  });

  it('fails on file and directory paths that differ only by case', () => {
    const result = check(
      repoWithIndex(['README.md', 'readme.md', 'Docs/a.md', 'docs/b.md']),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md  vs  readme.md');
    expect(result.stderr).toContain('Docs  vs  docs');
  });

  it('allows non-module files that share a stem', () => {
    const result = check(repoWithIndex(['app/App.tsx', 'app/app.json']));
    expect(result.status).toBe(0);
  });

  it('runs in the CI build job', () => {
    const ci = parse(
      readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'),
    ) as { jobs: { build: { steps: { run?: string }[] } } };
    expect(
      ci.jobs.build.steps.some(
        (step) => step.run === 'npm run check:case-collisions',
      ),
    ).toBe(true);
  });
});
