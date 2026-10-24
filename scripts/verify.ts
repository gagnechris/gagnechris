import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface Workspace {
  name: string;
  dir: string;
  deps: string[];
  scripts: string[];
  // apps/mobile has its own lockfile and runs with --prefix, not -w.
  prefix?: boolean;
}

export interface Step {
  name: string;
  cmd: string[];
  // Steps with the same group run one after another.
  group?: string;
  env?: Record<string, string>;
  // Generate steps rewrite files that other steps read, so they all finish
  // before any other step starts.
  phase?: 'generate';
}

// Unit tests run where the local date is a day ahead of UTC for most of the
// day, so a test that hard-codes today or mixes UTC and local dates fails on
// its own PR instead of on main days later. CI and mobile-checks.sh use it too.
export const TEST_TZ = 'Pacific/Kiritimati';

// Changes here can break any workspace.
const GLOBAL_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'eslint.config.js',
  '.nvmrc',
  '.npmrc',
];

// Changes here can change the result for files nobody touched.
const LINT_CONFIG = ['eslint.config.js', 'package.json', 'package-lock.json'];
const FORMAT_CONFIG = [
  'prettier.config.js',
  '.prettierignore',
  'package.json',
  'package-lock.json',
];

const LINTABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// Inputs outside a workspace's own directory, by workspace directory.
const EXTRA_INPUTS: Record<string, string[]> = {
  scripts: [
    '.github/',
    '.githooks/',
    '.claude/hooks/',
    'packages/app-core/',
    'packages/ui/',
  ],
};

// openapi:check and go:generate:check both rewrite the generated Go files.
const GO_CODEGEN_GROUP = 'go-codegen';
const GO_GROUP = 'go';

// Inputs of each generated-file check; a change under any prefix runs it.
const CODEGEN: Array<{ script: string; inputs: string[]; group?: string }> = [
  {
    script: 'openapi:check',
    group: GO_CODEGEN_GROUP,
    inputs: [
      'packages/shared/',
      'packages/api-client/',
      'scripts/generate-go-contract.ts',
    ],
  },
  {
    script: 'go:generate:check',
    group: GO_CODEGEN_GROUP,
    inputs: [
      'packages/shared/',
      'packages/data/',
      'services/api/internal/contract/',
      'services/api/internal/apitypes/',
      'scripts/generate-go-contract.ts',
    ],
  },
  { script: 'tokens:check', inputs: ['packages/tokens/'] },
  {
    script: 'publish-surface:check',
    inputs: [
      'services/publisher/',
      'packages/data/',
      'packages/shared/',
      'infra/lib/cloudfront/',
      'scripts/publisher-owned-paths.generated.txt',
    ],
  },
];

export function loadWorkspaces(root = ROOT): Workspace[] {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    workspaces: string[];
  };
  const dirs = pkg.workspaces.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern];
    const parent = pattern.slice(0, -2);
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          existsSync(join(root, parent, e.name, 'package.json')),
      )
      .map((e) => `${parent}/${e.name}`);
  });
  const read = (dir: string, prefix?: boolean): Workspace => {
    const p = JSON.parse(
      readFileSync(join(root, dir, 'package.json'), 'utf8'),
    ) as {
      name: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: p.name,
      dir,
      deps: Object.keys({ ...p.dependencies, ...p.devDependencies }).filter(
        (d) => d.startsWith('@gagnechris/'),
      ),
      scripts: Object.keys(p.scripts ?? {}),
      ...(prefix ? { prefix } : {}),
    };
  };
  const all = dirs.map((d) => read(d));
  if (existsSync(join(root, 'apps/mobile/package.json')))
    all.push(read('apps/mobile', true));
  return all;
}

const inDir = (file: string, dir: string) => file.startsWith(`${dir}/`);

export function affectedWorkspaces(
  changed: string[],
  all: Workspace[],
): Workspace[] {
  if (changed.some((f) => GLOBAL_FILES.includes(f))) return all;
  const hit = new Set(
    all
      .filter((w) =>
        changed.some(
          (f) =>
            inDir(f, w.dir) ||
            (EXTRA_INPUTS[w.dir] ?? []).some((i) => f.startsWith(i)),
        ),
      )
      .map((w) => w.name),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of all) {
      if (!hit.has(w.name) && w.deps.some((d) => hit.has(d))) {
        hit.add(w.name);
        grew = true;
      }
    }
  }
  return all.filter((w) => hit.has(w.name));
}

const npmRun = (w: Workspace, script: string): string[] =>
  w.prefix
    ? ['npm', 'run', script, '--prefix', w.dir]
    : ['npm', 'run', script, '-w', w.name];

// `deleted` (removed files and the old side of renames) counts for every
// check except Prettier and ESLint, which get only `existing`.
export function planSteps(
  existing: string[],
  added: string[],
  all: Workspace[],
  everything = false,
  deleted: string[] = [],
): Step[] {
  const steps: Step[] = [];
  const files = everything ? [] : existing;
  const changed = [...existing, ...deleted];
  const lintConfig = changed.some((f) => LINT_CONFIG.includes(f));

  if (everything || changed.some((f) => FORMAT_CONFIG.includes(f))) {
    steps.push({ name: 'Prettier', cmd: ['npm', 'run', 'format:check'] });
  } else if (files.length > 0) {
    steps.push({
      name: 'Prettier',
      cmd: ['npx', 'prettier', '--check', '--ignore-unknown', ...files],
    });
  }

  const lintable = files.filter(
    (f) => LINTABLE.test(f) && !inDir(f, 'apps/mobile'),
  );
  if (everything || lintConfig) {
    steps.push({ name: 'ESLint', cmd: ['npm', 'run', 'lint'] });
  } else if (lintable.length > 0) {
    steps.push({
      name: 'ESLint',
      cmd: ['npx', 'eslint', '--no-warn-ignored', ...lintable],
    });
  }

  const workspaces = everything ? all : affectedWorkspaces(changed, all);
  for (const w of workspaces) {
    if (w.scripts.includes('typecheck')) {
      steps.push({ name: `Typecheck ${w.name}`, cmd: npmRun(w, 'typecheck') });
    }
    if (
      w.prefix &&
      w.scripts.includes('lint') &&
      (everything || lintConfig || changed.some((f) => inDir(f, w.dir)))
    ) {
      steps.push({ name: `Lint ${w.name}`, cmd: npmRun(w, 'lint') });
    }
    if (w.scripts.includes('test')) {
      steps.push({
        name: `Test ${w.name}`,
        cmd: npmRun(w, 'test'),
        env: { TZ: TEST_TZ },
      });
    }
  }

  const global = changed.some((f) => GLOBAL_FILES.includes(f));
  for (const { script, inputs, group } of CODEGEN) {
    if (
      everything ||
      global ||
      changed.some((f) => inputs.some((i) => f.startsWith(i)))
    ) {
      steps.push({
        name: script,
        cmd: ['npm', 'run', script],
        phase: 'generate',
        ...(group ? { group } : {}),
      });
    }
  }

  // The scripts tests include the repo-wide ticket-id check, which any file
  // can fail.
  if (
    changed.length > 0 &&
    !steps.some((s) => s.name === 'Test @gagnechris/scripts')
  ) {
    steps.push({
      name: 'Ticket ids',
      cmd: [
        'npm',
        'run',
        'test',
        '-w',
        '@gagnechris/scripts',
        '--',
        'test/no-ticket-ids.test.ts',
      ],
    });
  }

  if (
    everything ||
    added.some((f) => /\.(ts|tsx)$/.test(f)) ||
    changed.some((f) => /(^|\/)tsconfig[^/]*\.json$/.test(f))
  ) {
    steps.push({
      name: 'TypeScript project coverage',
      cmd: ['npm', 'run', 'check:tsconfig-coverage'],
    });
  }
  if (everything || added.length > 0) {
    steps.push({
      name: 'Case collisions',
      cmd: ['npm', 'run', 'check:case-collisions'],
    });
  }

  const goChanged = changed.some(
    (f) => inDir(f, 'services/api') && !inDir(f, 'services/api/test'),
  );
  if (everything || goChanged) {
    steps.push({
      name: 'Go lint',
      cmd: ['npm', 'run', 'go:lint'],
      group: GO_GROUP,
    });
    steps.push({
      name: 'Go test',
      cmd: ['npm', 'run', 'go:test'],
      group: GO_GROUP,
    });
  }
  return steps;
}

function git(args: string[], root = ROOT): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0)
    throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

const lines = (s: string) => s.split('\n').filter(Boolean);

// The checks read the working tree, so they speak for a pushed commit only
// when the tree is that commit.
export function pushedTreeProblem(
  sha: string,
  root = ROOT,
): string | undefined {
  const head = git(['rev-parse', 'HEAD'], root);
  const pushed = git(['rev-parse', `${sha}^{commit}`], root);
  if (head !== pushed) {
    return `the pushed commit ${pushed.slice(0, 12)} is not HEAD (${head.slice(0, 12)}); check it out and push again`;
  }
  const dirty = git(['status', '--porcelain', '--untracked-files=all'], root);
  if (dirty) {
    return `the working tree has changes the push does not carry; commit or stash them (git stash -u) and push again:\n${dirty}`;
  }
  return undefined;
}

export function changedFiles(
  root = ROOT,
): { changed: string[]; added: string[]; deleted: string[] } | undefined {
  let base: string;
  try {
    base = git(['merge-base', 'origin/main', 'HEAD'], root);
  } catch {
    return undefined;
  }
  // Against the working tree, so uncommitted edits count too. Without rename
  // detection a rename lists both paths.
  const untracked = lines(
    git(['ls-files', '--others', '--exclude-standard'], root),
  );
  const changed = new Set([
    ...lines(
      git(
        ['diff', '--name-only', '--no-renames', '--diff-filter=ACMRD', base],
        root,
      ),
    ),
    ...untracked,
  ]);
  const added = new Set([
    ...lines(git(['diff', '--name-only', '--diff-filter=AR', base], root)),
    ...untracked,
  ]);
  const exists = (f: string) => existsSync(join(root, f));
  return {
    changed: [...changed].filter(exists).sort(),
    added: [...added].sort(),
    deleted: [...changed].filter((f) => !exists(f)).sort(),
  };
}

export interface Result {
  step: Step;
  ok: boolean;
  output: string;
  seconds: number;
}

// Git exports GIT_DIR and friends to hooks. A check that inherits them and
// runs git elsewhere (the scripts tests `git init` temp repos) acts on this
// repository instead, and from a worktree marks it bare.
export function stepEnv(
  env: NodeJS.ProcessEnv,
  step: Pick<Step, 'env'>,
): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('GIT_')),
  );
  return { ...inherited, FORCE_COLOR: '1', ...step.env };
}

function run(step: Step): Promise<Result> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(step.cmd[0]!, step.cmd.slice(1), {
      cwd: ROOT,
      env: stepEnv(process.env, step),
    });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('close', (code) =>
      resolve({
        step,
        ok: code === 0,
        output,
        seconds: Math.round((Date.now() - start) / 1000),
      }),
    );
  });
}

// A group's steps run in order as one unit of the worker pool.
export function schedule(steps: Step[]): Step[][] {
  const units: Step[][] = [];
  const groups = new Map<string, Step[]>();
  for (const step of steps) {
    if (!step.group) {
      units.push([step]);
      continue;
    }
    let unit = groups.get(step.group);
    if (!unit) {
      unit = [];
      groups.set(step.group, unit);
      units.push(unit);
    }
    unit.push(step);
  }
  return units;
}

export async function runAll(
  steps: Step[],
  concurrency: number,
  runStep: (step: Step) => Promise<Result> = run,
): Promise<Result[]> {
  const results: Result[] = [];
  const pool = async (units: Step[][]) => {
    let next = 0;
    const worker = async () => {
      while (next < units.length) {
        for (const step of units[next++]!) {
          const result = await runStep(step);
          console.log(
            `${result.ok ? '✓' : '✗'} ${result.step.name} (${result.seconds}s)`,
          );
          if (!result.ok) console.log(result.output);
          results.push(result);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  };
  await pool(schedule(steps.filter((s) => s.phase === 'generate')));
  await pool(schedule(steps.filter((s) => s.phase !== 'generate')));
  return results;
}

async function main(argv: string[]) {
  const everything = argv.includes('--all');
  const pushedAt = argv.indexOf('--pushed');
  if (pushedAt !== -1) {
    const problem = pushedTreeProblem(argv[pushedAt + 1] ?? '');
    if (problem) {
      console.error(
        `verify: ${problem}\n(git push --no-verify skips this check.)`,
      );
      process.exit(1);
    }
  }
  const diff = everything ? undefined : changedFiles();
  if (!everything && !diff) {
    console.log('No origin/main to diff against; running every check.');
  }
  const all = loadWorkspaces();
  const steps = planSteps(
    diff?.changed ?? [],
    diff?.added ?? [],
    all,
    everything || !diff,
    diff?.deleted ?? [],
  );
  if (steps.length === 0) {
    console.log('verify: nothing to check.');
    return;
  }
  console.log(
    `verify: ${steps.length} checks for ${diff ? `${diff.changed.length} changed files` : 'the whole repo'}`,
  );
  const concurrency = Math.max(
    1,
    Math.min(4, Math.floor(availableParallelism() / 2)),
  );
  const failed = (await runAll(steps, concurrency)).filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `\nverify failed: ${failed.map((r) => r.step.name).join(', ')}`,
    );
    process.exit(1);
  }
  console.log('\nverify passed.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
