import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('the repo', () => {
  // .cursor/rules/comments-and-docs.mdc: history and ticket ids live in git and Linear.
  it('has no Linear ticket ids in tracked files', () => {
    const grep = spawnSync(
      'git',
      ['grep', '-n', '-E', 'CHR-[0-9]+', '--', '.', ':!package-lock.json'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    // git grep exits 1 when nothing matches.
    expect(grep.status, grep.stderr).toBe(1);
    expect(grep.stdout).toBe('');
  });
});
