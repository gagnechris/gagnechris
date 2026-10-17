import { execFileSync, spawnSync } from 'node:child_process';
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
import {
  affectedWorkspaces,
  loadWorkspaces,
  planSteps,
  pushedTreeProblem,
  runAll,
  schedule,
  TEST_TZ,
  type Step,
  type Workspace,
} from '../verify.js';

const ws = (
  name: string,
  dir: string,
  deps: string[] = [],
  extra: Partial<Workspace> = {},
): Workspace => ({
  name,
  dir,
  deps,
  scripts: ['typecheck', 'lint', 'test'],
  ...extra,
});

const all = [
  ws('@gagnechris/shared', 'packages/shared'),
  ws('@gagnechris/data', 'packages/data', ['@gagnechris/shared']),
  ws('@gagnechris/web', 'apps/web', ['@gagnechris/shared']),
  ws('@gagnechris/tokens', 'packages/tokens'),
  ws('@gagnechris/mobile', 'apps/mobile', ['@gagnechris/shared'], {
    prefix: true,
  }),
  ws('@gagnechris/scripts', 'scripts'),
];

const names = (steps: { name: string }[]) => steps.map((s) => s.name);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpRoots: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-'));
  tmpRoots.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

describe('verify', () => {
  it('checks a changed workspace and every workspace that depends on it', () => {
    expect(
      affectedWorkspaces(['packages/shared/src/a.ts'], all).map((w) => w.name),
    ).toEqual([
      '@gagnechris/shared',
      '@gagnechris/data',
      '@gagnechris/web',
      '@gagnechris/mobile',
    ]);
    expect(
      affectedWorkspaces(['apps/web/src/a.tsx'], all).map((w) => w.name),
    ).toEqual(['@gagnechris/web']);
  });

  it('checks every workspace when the root install or config changes', () => {
    expect(affectedWorkspaces(['package-lock.json'], all)).toHaveLength(
      all.length,
    );
  });

  it('runs tests, and only tests, in TEST_TZ', () => {
    const steps = planSteps(['apps/web/src/a.tsx'], [], all);
    for (const step of steps) {
      expect(step.env?.TZ).toBe(
        step.name.startsWith('Test ') ? TEST_TZ : undefined,
      );
    }
  });

  it('formats and lints only the changed files', () => {
    const steps = planSteps(['apps/web/src/a.tsx', 'docs/x.md'], [], all);
    expect(steps[0]!.cmd).toEqual([
      'npx',
      'prettier',
      '--check',
      '--ignore-unknown',
      'apps/web/src/a.tsx',
      'docs/x.md',
    ]);
    expect(steps[1]!.cmd).toEqual([
      'npx',
      'eslint',
      '--no-warn-ignored',
      'apps/web/src/a.tsx',
    ]);
    expect(names(steps)).toEqual([
      'Prettier',
      'ESLint',
      'Typecheck @gagnechris/web',
      'Test @gagnechris/web',
      'Ticket ids',
    ]);
  });

  it('lints everything when the ESLint config or its dependencies change', () => {
    for (const file of ['eslint.config.js', 'package-lock.json']) {
      const steps = planSteps([file], [], all);
      expect(steps.find((s) => s.name === 'ESLint')!.cmd).toEqual([
        'npm',
        'run',
        'lint',
      ]);
      expect(names(steps)).toContain('Lint @gagnechris/mobile');
    }
  });

  it('checks the formatting of every file when the Prettier config changes', () => {
    for (const file of ['prettier.config.js', '.prettierignore']) {
      expect(
        planSteps([file], [], all).find((s) => s.name === 'Prettier')!.cmd,
      ).toEqual(['npm', 'run', 'format:check']);
    }
  });

  it('checks a docs-only change for ticket ids', () => {
    expect(names(planSteps(['docs/x.md'], [], all))).toEqual([
      'Prettier',
      'Ticket ids',
    ]);
    expect(names(planSteps(['CLAUDE.md'], [], all))).toContain('Ticket ids');
    // The scripts tests already include it.
    expect(names(planSteps(['scripts/verify.ts'], [], all))).not.toContain(
      'Ticket ids',
    );
  });

  it('runs the generated-file checks whose inputs changed', () => {
    expect(names(planSteps(['packages/shared/src/a.ts'], [], all))).toEqual(
      expect.arrayContaining([
        'openapi:check',
        'go:generate:check',
        'publish-surface:check',
      ]),
    );
    expect(names(planSteps(['packages/tokens/src/t.ts'], [], all))).toContain(
      'tokens:check',
    );
    expect(names(planSteps(['apps/web/src/a.tsx'], [], all))).not.toContain(
      'openapi:check',
    );
  });

  it('runs Go checks for Go changes but not for the TypeScript HTTP suite', () => {
    expect(names(planSteps(['services/api/internal/x.go'], [], all))).toEqual(
      expect.arrayContaining(['Go lint', 'Go test']),
    );
    expect(
      names(planSteps(['services/api/test/http/a.test.ts'], [], all)),
    ).not.toContain('Go test');
  });

  it('runs mobile checks with --prefix and its own lint', () => {
    const steps = planSteps(['apps/mobile/src/a.tsx'], [], all);
    expect(
      steps.find((s) => s.name === 'Lint @gagnechris/mobile')!.cmd,
    ).toEqual(['npm', 'run', 'lint', '--prefix', 'apps/mobile']);
    expect(names(steps)).not.toContain('ESLint');
  });

  it('checks tsconfig coverage and case collisions when files are added', () => {
    expect(
      names(planSteps(['apps/web/src/new.ts'], ['apps/web/src/new.ts'], all)),
    ).toEqual(
      expect.arrayContaining([
        'TypeScript project coverage',
        'Case collisions',
      ]),
    );
  });

  it('checks the importers of a deleted file but formats nothing', () => {
    const steps = planSteps([], [], all, false, [
      'packages/shared/src/gone.ts',
    ]);
    expect(names(steps)).toEqual(
      expect.arrayContaining([
        'Typecheck @gagnechris/shared',
        'Typecheck @gagnechris/web',
        'go:generate:check',
      ]),
    );
    expect(names(steps)).not.toContain('Prettier');
    expect(names(steps)).not.toContain('ESLint');
  });

  it('checks both workspaces of a file moved between them', () => {
    const steps = planSteps(
      ['packages/tokens/src/a.ts'],
      ['packages/tokens/src/a.ts'],
      all,
      false,
      ['apps/web/src/a.ts'],
    );
    expect(names(steps)).toEqual(
      expect.arrayContaining([
        'Typecheck @gagnechris/tokens',
        'Typecheck @gagnechris/web',
      ]),
    );
    expect(steps.find((s) => s.name === 'Prettier')!.cmd).not.toContain(
      'apps/web/src/a.ts',
    );
  });

  it('runs the scripts tests when only workflows or git or session hooks change', () => {
    for (const file of [
      '.github/workflows/ci.yml',
      '.githooks/pre-push',
      '.claude/hooks/session-start.sh',
    ]) {
      expect(names(planSteps([file], [], all))).toContain(
        'Test @gagnechris/scripts',
      );
    }
  });

  it('runs the two Go code generators one after another, and the Go steps one after another', () => {
    const steps = planSteps(
      ['packages/shared/src/a.ts', 'services/api/internal/x.go'],
      [],
      all,
    );
    const units = schedule(steps).map((u) => u.map((s) => s.name));
    expect(units).toContainEqual(['openapi:check', 'go:generate:check']);
    expect(units).toContainEqual(['Go lint', 'Go test']);
    expect(units.filter((u) => u.length > 1)).toHaveLength(2);
  });

  it('finishes every code generator before any other check starts', async () => {
    const steps = planSteps(
      [
        'packages/shared/src/a.ts',
        'packages/tokens/src/t.ts',
        'services/api/internal/x.go',
      ],
      [],
      all,
    );
    const generators = [
      'openapi:check',
      'go:generate:check',
      'tokens:check',
      'publish-surface:check',
    ];
    expect(names(steps)).toEqual(expect.arrayContaining(generators));
    const events: string[] = [];
    await quiet(() =>
      runAll(steps, 4, async (step) => {
        events.push(`start ${step.name}`);
        // Generators take longer, so a check started alongside one would
        // start before it ends.
        const ms = generators.includes(step.name) ? 20 : 1;
        await new Promise((r) => setTimeout(r, ms));
        events.push(`end ${step.name}`);
        return { step, ok: true, output: '', seconds: 0 };
      }),
    );
    const lastGeneratorEnd = Math.max(
      ...generators.map((g) => events.indexOf(`end ${g}`)),
    );
    const firstOtherStart = events.findIndex(
      (e) =>
        e.startsWith('start ') &&
        !generators.includes(e.slice('start '.length)),
    );
    expect(firstOtherStart).toBeGreaterThan(lastGeneratorEnd);
  });

  it('never overlaps two steps of one group', async () => {
    const steps: Step[] = [
      { name: 'a', cmd: [], group: 'g' },
      { name: 'b', cmd: [] },
      { name: 'c', cmd: [], group: 'g' },
      { name: 'd', cmd: [] },
    ];
    let running = 0;
    let most = 0;
    const log = console.log;
    console.log = () => {};
    try {
      await runAll(steps, 4, async (step) => {
        if (step.group) most = Math.max(most, ++running);
        await new Promise((r) => setTimeout(r, 10));
        if (step.group) running--;
        return { step, ok: true, output: '', seconds: 0 };
      });
    } finally {
      console.log = log;
    }
    expect(most).toBe(1);
  });

  it('runs every CI check with --all', () => {
    expect(names(planSteps([], [], all, true))).toEqual(
      expect.arrayContaining([
        'Prettier',
        'ESLint',
        'openapi:check',
        'tokens:check',
        'Go test',
        'Test @gagnechris/tokens',
      ]),
    );
  });

  describe('a pushed commit', () => {
    const repo = tempDir();
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'ci',
          GIT_AUTHOR_EMAIL: '',
          GIT_COMMITTER_NAME: 'ci',
          GIT_COMMITTER_EMAIL: '',
        },
      }).trim();
    git('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'a.ts'), 'export {};\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'a');
    const first = git('rev-parse', 'HEAD');
    writeFileSync(join(repo, 'b.ts'), 'export {};\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'b');
    const head = git('rev-parse', 'HEAD');

    it('is verified when the working tree is that commit', () => {
      expect(pushedTreeProblem(head, repo)).toBeUndefined();
    });

    it('is refused when it is not HEAD', () => {
      expect(pushedTreeProblem(first, repo)).toMatch(/is not HEAD/);
    });

    it('is refused when the working tree has edits or new files the push lacks', () => {
      writeFileSync(join(repo, 'a.ts'), 'export const x = 1;\n');
      expect(pushedTreeProblem(head, repo)).toMatch(/M a\.ts/);
      git('checkout', '--', 'a.ts');
      mkdirSync(join(repo, 'src'));
      writeFileSync(join(repo, 'src', 'forgotten.ts'), 'export {};\n');
      expect(pushedTreeProblem(head, repo)).toMatch(/src\/forgotten\.ts/);
      rmSync(join(repo, 'src'), { recursive: true });
      expect(pushedTreeProblem(head, repo)).toBeUndefined();
    });

    it('is what the pre-push hook verifies', () => {
      const bin = tempDir();
      const log = join(bin, 'npm.log');
      writeFileSync(
        join(bin, 'npm'),
        `#!/usr/bin/env bash\necho "$*" >> '${log}'\n`,
      );
      chmodSync(join(bin, 'npm'), 0o755);
      const hook = (stdin: string) =>
        spawnSync('bash', [join(ROOT, '.githooks', 'pre-push')], {
          cwd: repo,
          input: stdin,
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
          encoding: 'utf8',
        });
      const zero = '0'.repeat(40);
      const r = hook(
        `refs/heads/main ${head} refs/heads/main ${first}\n` +
          `(delete) ${zero} refs/heads/old ${first}\n`,
      );
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(log, 'utf8')).toBe(
        `run --silent verify -- --pushed ${head}\n`,
      );
      const two = hook(
        `refs/heads/main ${head} refs/heads/main ${zero}\n` +
          `refs/heads/other ${first} refs/heads/other ${zero}\n`,
      );
      expect(two.status).toBe(1);
      expect(two.stderr).toMatch(/one branch at a time/);
    });
  });

  it('reads every root workspace and apps/mobile', () => {
    const real = loadWorkspaces();
    expect(real.map((w) => w.dir)).toEqual(
      expect.arrayContaining([
        'apps/web',
        'packages/shared',
        'scripts',
        'apps/mobile',
      ]),
    );
    expect(real.find((w) => w.dir === 'apps/mobile')!.prefix).toBe(true);
  });
});
