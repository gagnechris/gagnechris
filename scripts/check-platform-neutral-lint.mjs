import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const fixtures = [
  {
    dir: 'packages/app-core/src',
    source: `import fs from 'node:fs';\nexport const x = fs;\n`,
    expect: 'node:',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `import fs from 'fs';\nexport const x = fs;\n`,
    expect: 'fs',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `export async function x() { return import('node:fs'); }\n`,
    expect: 'node:',
    rule: 'no-restricted-syntax',
  },
  {
    dir: 'packages/api-client/src',
    source: `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';\nexport const x = DynamoDBClient;\n`,
    expect: '@aws-sdk',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/tokens/src',
    source: `import { createRoot } from 'react-dom/client';\nexport const x = createRoot;\n`,
    expect: 'react-dom',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `import { marked } from 'marked';\nexport const x = marked;\n`,
    expect: 'marked',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `import { SK_META } from '@gagnechris/data';\nexport const x = SK_META;\n`,
    expect: '@gagnechris/data',
    rule: 'no-restricted-imports',
  },
  {
    // A new shared domain file (not in any allowlist) must still be covered.
    dir: 'packages/shared/src',
    source: `import fs from 'node:fs';\nexport const x = fs;\n`,
    expect: 'node:',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/shared/src',
    source: `import { renderMarkdownToHtml } from './render.js';\nexport const x = renderMarkdownToHtml;\n`,
    expect: 'render',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `import { renderMarkdownToHtml } from '@gagnechris/shared/render';\nexport const x = renderMarkdownToHtml;\n`,
    expect: '@gagnechris/shared',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `import { DEFAULT_HOME } from '../shared/src/index.js';\nexport const x = DEFAULT_HOME;\n`,
    expect: '../shared',
    rule: 'no-restricted-imports',
  },
  {
    dir: 'packages/app-core/src',
    source: `export const x = process.env.NODE_ENV;\n`,
    expect: 'process',
    rule: 'no-restricted-globals',
  },
  {
    dir: 'packages/app-core/src',
    source: `export const x = globalThis.process?.env?.NODE_ENV;\n`,
    expect: 'globalThis.process',
    rule: 'no-restricted-syntax',
  },
  {
    dir: 'packages/shared/src',
    source: `export const x = typeof window !== 'undefined' ? window.location : null;\n`,
    expect: 'window',
    rule: 'no-restricted-globals',
  },
  {
    dir: 'packages/app-core/src',
    source: `export const x = typeof navigator !== 'undefined' ? navigator.userAgent : '';\n`,
    expect: 'navigator',
    rule: 'no-restricted-globals',
  },
  {
    dir: 'packages/app-core/src',
    source: `export const x = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('k') : null;\n`,
    expect: 'sessionStorage',
    rule: 'no-restricted-globals',
  },
  {
    dir: 'packages/app-core/src',
    source: `export const x = typeof location !== 'undefined' ? location.href : '';\n`,
    expect: 'location',
    rule: 'no-restricted-globals',
  },
];

let failed = false;
const created = [];

try {
  for (const fixture of fixtures) {
    const fileName = `_platform-neutral-lint-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;
    const filePath = join(repoRoot, fixture.dir, fileName);
    writeFileSync(filePath, fixture.source);
    created.push(filePath);

    const result = spawnSync('npx', ['eslint', filePath, '--no-warn-ignored'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const lintFailed = result.status !== 0;
    const mentionsRule =
      output.includes(fixture.rule) || output.includes(fixture.expect);

    if (!lintFailed || !mentionsRule) {
      failed = true;
      console.error(
        `Expected ESLint ${fixture.rule} failure for ${fixture.dir} (${fixture.expect}).`,
      );
      console.error(`exit=${result.status}`);
      console.error(output || '(no output)');
    } else {
      console.log(`OK: ${fixture.dir} rejects ${fixture.expect}`);
    }
  }
} finally {
  for (const filePath of created) {
    try {
      rmSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('Platform-neutral lint bans OK.');
