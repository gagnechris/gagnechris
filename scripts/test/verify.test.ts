import { describe, expect, it } from 'vitest';
import {
  affectedWorkspaces,
  loadWorkspaces,
  planSteps,
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
