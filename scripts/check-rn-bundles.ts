/**
 * Fail if any React Native-facing package entry pulls banned modules (CHR-156).
 * Run: `npm run check:rn-bundles`
 */
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

/** Bare imports / path prefixes that must never appear in RN-facing bundles. */
const bannedImportPrefixes = [
  'node:',
  '@aws-sdk/',
  'aws-amplify',
  '@codemirror/',
  'react-dom',
  'marked',
  'zod-to-openapi',
] as const;

/** Source path fragments that must not appear in the shared domain graph. */
const bannedPathFragments = [
  'markdown.ts',
  'home-html.ts',
  'resume-html.ts',
  'html.ts',
  'dynamodb.ts',
  'openapi.ts',
  'openapi-extend.ts',
  'generate-openapi.ts',
] as const;

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

let failed = false;

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
      plugins: [banImportsPlugin],
      external: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
        'openapi-fetch',
        'zod',
        '@gagnechris/api-client',
        '@gagnechris/shared',
        '@gagnechris/tokens',
      ],
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
        normalized.includes(fragment) || normalized.endsWith(`/${fragment}`),
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
