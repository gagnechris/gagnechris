/**
 * Fail if previously uncovered .ts files are still outside `tsc --listFilesOnly`
 * (CHR-180). For each workspace, unions every tsconfig*.json project.
 * Run: `npm run check:tsconfig-coverage`
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const workspaces = [
  'packages/shared',
  'packages/api-client',
  'packages/tokens',
  'packages/data',
  'packages/app-core',
  'services/api',
  'services/publisher',
  'services/restore-test',
  'infra',
];

const ignoreDirNames = new Set([
  'node_modules',
  'dist',
  'coverage',
  'cdk.out',
  '.local-site',
]);

function walkTsFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (ignoreDirNames.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function tsconfigsFor(wsRoot) {
  const names = readdirSync(wsRoot).filter(
    (n) => n.startsWith('tsconfig') && n.endsWith('.json'),
  );
  return names.length > 0 ? names : ['tsconfig.json'];
}

function listFilesForWorkspace(wsRoot) {
  const listed = new Set();
  let failed = null;
  for (const name of tsconfigsFor(wsRoot)) {
    const project = join(wsRoot, name);
    if (!existsSync(project)) continue;
    const result = spawnSync('npx', ['tsc', '-p', project, '--listFilesOnly'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      failed = { name, result };
      break;
    }
    for (const line of (result.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) listed.add(relative(repoRoot, trimmed));
    }
  }
  return { listed, failed };
}

let failed = false;

for (const ws of workspaces) {
  const wsRoot = join(repoRoot, ws);
  const pkg = JSON.parse(readFileSync(join(wsRoot, 'package.json'), 'utf8'));
  if (!pkg.scripts?.typecheck) {
    console.log(`SKIP ${ws}: no typecheck script`);
    continue;
  }

  const { listed, failed: listFailed } = listFilesForWorkspace(wsRoot);
  if (listFailed) {
    failed = true;
    console.error(
      `FAIL ${ws}: tsc --listFilesOnly (${listFailed.name}) exited ${listFailed.result.status}`,
    );
    console.error(listFailed.result.stderr || listFailed.result.stdout);
    continue;
  }

  const sources = walkTsFiles(wsRoot).filter((p) => {
    const rel = relative(wsRoot, p);
    if (rel === 'src/schema.d.ts') return false;
    return true;
  });

  const missing = sources.filter((p) => !listed.has(relative(repoRoot, p)));
  if (missing.length > 0) {
    failed = true;
    console.error(`FAIL ${ws}: ${missing.length} file(s) not typechecked:`);
    for (const m of missing.slice(0, 20)) {
      console.error(`  ${relative(repoRoot, m)}`);
    }
    if (missing.length > 20) {
      console.error(`  …and ${missing.length - 20} more`);
    }
  } else {
    console.log(`OK ${ws}: ${sources.length} local .ts files covered`);
  }
}

const required = [
  'packages/tokens/src/tokens.test.ts',
  'packages/app-core/vitest.config.ts',
  ...walkTsFiles(join(repoRoot, 'packages/data/test')).map((p) =>
    relative(repoRoot, p),
  ),
];

for (const rel of required) {
  const ws = rel.startsWith('packages/tokens')
    ? 'packages/tokens'
    : rel.startsWith('packages/app-core')
      ? 'packages/app-core'
      : 'packages/data';
  const { listed } = listFilesForWorkspace(join(repoRoot, ws));
  if (!listed.has(rel)) {
    failed = true;
    console.error(`FAIL required file not typechecked: ${rel}`);
  } else {
    console.log(`OK required: ${rel}`);
  }
}

if (failed) process.exit(1);
console.log('tsconfig coverage OK.');
