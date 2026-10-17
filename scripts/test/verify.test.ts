import { describe, expect, it } from 'vitest';
import {
  affectedWorkspaces,
  loadWorkspaces,
  planSteps,
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
    ]);
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

  it('runs the scripts tests when only workflows or git hooks change', () => {
    for (const file of ['.github/workflows/ci.yml', '.githooks/pre-push']) {
      expect(names(planSteps([file], [], all))).toContain(
        'Test @gagnechris/scripts',
      );
    }
  });

  it('runs the code generators and the Go steps one after another', () => {
    const steps = planSteps(
      ['packages/shared/src/a.ts', 'services/api/internal/x.go'],
      [],
      all,
    );
    const units = schedule(steps).map((u) => u.map((s) => s.name));
    expect(units).toContainEqual([
      'openapi:check',
      'go:generate:check',
      'Go lint',
      'Go test',
    ]);
    expect(units.filter((u) => u.length > 1)).toHaveLength(1);
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
