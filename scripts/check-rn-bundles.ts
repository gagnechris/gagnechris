import { build, type Plugin } from 'esbuild';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const entries = [
  {
    name: '@gagnechris/shared',
    path: join(repoRoot, 'packages/shared/src/index.ts'),
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
] as const;

const bannedImportPrefixes = [
  'node:',
  '@aws-sdk/',
  'aws-amplify',
  '@codemirror/',
  'react-dom',
  'marked',
  '@asteasolutions/zod-to-openapi',
  '@gagnechris/shared/',
] as const;

const bannedPathFragments = [
  'markdown.ts',
  'home-html.ts',
  'resume-html.ts',
  'project-html.ts',
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

function isBannedImport(path: string): boolean {
  return bannedImportPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

const banImportsPlugin: Plugin = {
  name: 'ban-platform-modules',
  setup(buildApi) {
    buildApi.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      if (!isBannedImport(args.path)) return undefined;
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
};

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
      plugins: [banImportsPlugin, exactExternalPlugin],
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

let failed = false;

if (!(await assertNegativeFixtureFails())) {
  failed = true;
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
      plugins: [banImportsPlugin, exactExternalPlugin],
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

  console.log(
    `${entry.name}: OK (${inputs.length} inputs, no banned modules).`,
  );
}

if (failed) {
  process.exit(1);
}
