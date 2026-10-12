import { build, type Plugin } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoLockfileParityErrors } from './lockfile-parity.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

type Entry = {
  name: string;
  path: string;
  /** Modules mobile depends on: the bundle must contain them, not just pass. */
  requiredInputs?: readonly string[];
  /** Banned imports this entry may use. */
  allowImports?: readonly string[];
};

const entries: readonly Entry[] = [
  {
    name: '@gagnechris/shared',
    path: join(repoRoot, 'packages/shared/src/index.ts'),
    requiredInputs: [
      'task-syntax.ts',
      'today-task-buckets.ts',
      'upcoming-groups.ts',
      'task-schedule-label.ts',
      'task-due.ts',
      'task-date-menu-items.ts',
      'task-date-menu-state.ts',
      'note-list-sections.ts',
    ].map((file) => `packages/shared/src/${file}`),
  },
  {
    // The native markdown renderer's AST: marked's lexer, never the sanitizers.
    name: '@gagnechris/shared/markdown-ast',
    path: join(repoRoot, 'packages/shared/src/markdown-ast.ts'),
    requiredInputs: [
      'packages/shared/src/markdown-ast.ts',
      'node_modules/marked/lib/marked.esm.js',
    ],
    allowImports: ['marked'],
  },
  {
    // The dev-only markdown screen's sample note.
    name: '@gagnechris/shared/fixtures/every-markdown-element',
    path: join(
      repoRoot,
      'packages/shared/src/fixtures/every-markdown-element.ts',
    ),
  },
  {
    name: '@gagnechris/api-client',
    path: join(repoRoot, 'packages/api-client/src/index.ts'),
  },
  {
    name: '@gagnechris/app-core',
    path: join(repoRoot, 'packages/app-core/src/index.ts'),
  },
  {
    name: '@gagnechris/tokens',
    path: join(repoRoot, 'packages/tokens/src/index.ts'),
  },
];

const bannedImportPrefixes = [
  'node:',
  '@aws-sdk/',
  'aws-amplify',
  '@codemirror/',
  'react-dom',
  'marked',
  'sanitize-html',
  'dompurify',
  '#sanitizer',
  '@asteasolutions/zod-to-openapi',
  '@gagnechris/shared/',
] as const;

const bannedPathFragments = [
  'markdown.ts',
  'home-page.ts',
  'resume-page.ts',
  'project-page.ts',
  'html.ts',
  'dynamodb.ts',
  'openapi.ts',
  'openapi-extend.ts',
  'generate-openapi.ts',
] as const;

/** Exact names only: externalizing `@gagnechris/shared` must not also hide `/render`. */
const exactExternals = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@tanstack/react-query',
  'openapi-fetch',
  'zod',
  '@gagnechris/api-client',
  '@gagnechris/shared',
  '@gagnechris/tokens',
]);

function isBannedImport(
  path: string,
  allowImports: readonly string[] = [],
): boolean {
  if (allowImports.includes(path)) return false;
  return bannedImportPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

const banImportsPlugin = (allowImports?: readonly string[]): Plugin => ({
  name: 'ban-platform-modules',
  setup(buildApi) {
    buildApi.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      if (!isBannedImport(args.path, allowImports)) return undefined;
      return {
        path: args.path,
        errors: [
          {
            text: `Banned import in RN-facing package: ${args.path}`,
          },
        ],
      };
    });
  },
});

const exactExternalPlugin: Plugin = {
  name: 'exact-external',
  setup(buildApi) {
    buildApi.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      if (!exactExternals.has(args.path)) return undefined;
      return { path: args.path, external: true };
    });
  },
};

async function assertNegativeFixtureFails(): Promise<boolean> {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'rn-bundle-neg-'));
  const entryPath = join(dir, 'bad-entry.ts');
  writeFileSync(
    entryPath,
    `import { marked } from 'marked';\nexport const x = marked;\n`,
  );
  try {
    await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      platform: 'neutral',
      format: 'esm',
      metafile: true,
      logLevel: 'silent',
      plugins: [banImportsPlugin(), exactExternalPlugin],
    });
    console.error(
      'Negative fixture: expected banned marked import to fail, but bundle succeeded.',
    );
    return false;
  } catch {
    console.log('Negative fixture: OK (marked import rejected).');
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const mobileSourceDirs = ['app', 'src', 'test', 'index.ts'].map((dir) =>
  join(repoRoot, 'apps/mobile', dir),
);

function mobileSourceFiles(path: string): string[] {
  if (/\.tsx?$/.test(path)) return [path];
  let names: string[];
  try {
    names = readdirSync(path);
  } catch {
    return [];
  }
  return names.flatMap((name) =>
    name === 'node_modules' ? [] : mobileSourceFiles(join(path, name)),
  );
}

/** Every `@gagnechris/*` specifier the iOS app imports, with one file that does. */
function mobileWorkspaceImports(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of mobileSourceDirs.flatMap(mobileSourceFiles)) {
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(
      /(?:from|import)\s*\(?\s*'(@gagnechris\/[^']+)'/g,
    )) {
      if (!found.has(specifier!)) {
        found.set(specifier!, relative(repoRoot, file));
      }
    }
  }
  return found;
}

/** Metro resolves with the `react-native` condition; without it a subpath falls back to `import`. */
function hasReactNativeCondition(specifier: string): boolean {
  const [, name, ...rest] = specifier.split('/');
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, 'packages', name!, 'package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> };
  const key = rest.length ? `./${rest.join('/')}` : '.';
  const target = manifest.exports?.[key];
  return (
    typeof target === 'object' && target !== null && 'react-native' in target
  );
}

let failed = false;

if (!(await assertNegativeFixtureFails())) {
  failed = true;
}

const entryNames = new Set(entries.map((entry) => entry.name));
for (const [specifier, file] of mobileWorkspaceImports()) {
  if (!entryNames.has(specifier)) {
    failed = true;
    console.error(
      `${specifier}: imported by ${file} but not checked here; add it to entries.`,
    );
  } else if (!hasReactNativeCondition(specifier)) {
    failed = true;
    console.error(
      `${specifier}: imported by ${file} but its package.json export has no "react-native" condition.`,
    );
  }
}

const allowedInApp = new Set(
  entries.flatMap((entry) => entry.allowImports ?? []),
);
const lockfileErrors = repoLockfileParityErrors(
  repoRoot,
  (name) => isBannedImport(name) && !allowedInApp.has(name),
);
if (lockfileErrors.length > 0) {
  failed = true;
  console.error(
    'Root and apps/mobile lockfiles disagree on what the RN-facing packages run:',
  );
  for (const error of lockfileErrors) console.error(`  ${error}`);
} else {
  console.log('Lockfile parity: OK (root and apps/mobile agree).');
}

for (const entry of entries) {
  let result;
  try {
    result = await build({
      entryPoints: [entry.path],
      bundle: true,
      write: false,
      platform: 'neutral',
      format: 'esm',
      metafile: true,
      logLevel: 'silent',
      plugins: [banImportsPlugin(entry.allowImports), exactExternalPlugin],
    });
  } catch (err) {
    failed = true;
    console.error(`${entry.name}: bundle failed (banned import or resolve):`);
    console.error(err instanceof Error ? err.message : err);
    continue;
  }

  const inputs = Object.keys(result.metafile?.inputs ?? {});
  const hits = inputs.filter((inputPath) => {
    const normalized = inputPath.replace(/\\/g, '/');
    return bannedPathFragments.some(
      (fragment) =>
        normalized.includes(`/${fragment}`) || normalized.endsWith(fragment),
    );
  });

  if (hits.length > 0) {
    failed = true;
    console.error(`${entry.name}: pulled banned modules:`);
    for (const hit of hits) {
      console.error(`  ${relative(repoRoot, hit) || hit}`);
    }
    continue;
  }

  const normalizedInputs = inputs.map((p) => p.replace(/\\/g, '/'));
  const missing = (entry.requiredInputs ?? []).filter(
    (required) => !normalizedInputs.some((p) => p.endsWith(required)),
  );
  if (missing.length > 0) {
    failed = true;
    console.error(`${entry.name}: missing required modules:`);
    for (const file of missing) console.error(`  ${file}`);
    continue;
  }

  console.log(
    `${entry.name}: OK (${inputs.length} inputs, no banned modules).`,
  );
}

if (failed) {
  process.exit(1);
}
