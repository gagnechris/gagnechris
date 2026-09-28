/**
 * Fail if the domain entry pulls marked, OpenAPI, HTML renderers, or Node Dynamo helpers.
 * Run: `npm run check:domain-bundle -w @gagnechris/shared`
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src/index.ts');

const result = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: 'neutral',
  format: 'esm',
  metafile: true,
  logLevel: 'silent',
});

const inputs = Object.keys(result.metafile?.inputs ?? {});
const banned = [
  'marked',
  'zod-to-openapi',
  'markdown.ts',
  'home-html.ts',
  'resume-html.ts',
  'html.ts',
  'dynamodb.ts',
  'openapi.ts',
];

const hits = inputs.filter((p) =>
  banned.some((b) => p.includes(b) || p.replace(/\\/g, '/').endsWith(`/${b}`)),
);

if (hits.length > 0) {
  console.error('Domain entry pulled banned modules:');
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log(
  `Domain bundle OK (${inputs.length} inputs, no marked/openapi/html/dynamodb).`,
);
