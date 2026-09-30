/**
 * Acceptance check (CHR-156): banned imports into RN-facing packages fail lint.
 * Run: `npm run check:platform-neutral-lint`
 */
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
  },
  {
    dir: 'packages/api-client/src',
    source: `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';\nexport const x = DynamoDBClient;\n`,
    expect: '@aws-sdk',
  },
  {
    dir: 'packages/tokens/src',
    source: `import { createRoot } from 'react-dom/client';\nexport const x = createRoot;\n`,
    expect: 'react-dom',
  },
  {
    dir: 'packages/shared/src',
    file: 'excerpt.platform-neutral-lint-fixture.ts',
    source: `import path from 'node:path';\nexport const x = path;\n`,
    expect: 'node:',
  },
];

let failed = false;
const created = [];

try {
  for (const fixture of fixtures) {
    const fileName =
      fixture.file ??
      `_platform-neutral-lint-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;
    const filePath = join(repoRoot, fixture.dir, fileName);
    writeFileSync(filePath, fixture.source);
    created.push(filePath);

    const result = spawnSync(
      'npx',
      ['eslint', filePath, '--no-warn-ignored'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
      },
    );

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const lintFailed = result.status !== 0;
    const mentionsRule =
      output.includes('no-restricted-imports') ||
      output.includes(fixture.expect);

    if (!lintFailed || !mentionsRule) {
      failed = true;
      console.error(
        `Expected ESLint no-restricted-imports failure for ${fixture.dir} (${fixture.expect}).`,
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
