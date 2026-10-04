// @vitest-environment node
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const eslint = new ESLint({ cwd: repoRoot });

const lintKitImport = async (specifier: string) => {
  const [result] = await eslint.lintText(
    `import * as mod from '${specifier}';\nexport const x = mod;\n`,
    { filePath: path.join(repoRoot, 'apps/web/src/kit/ZoneProbe.tsx') },
  );
  return result!.messages
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message);
};

describe('kit import zone', () => {
  it.each([
    '@gagnechris/app-core',
    '@tanstack/react-query',
    'aws-amplify',
    'aws-amplify/auth',
    '@aws-amplify/core',
    '@gagnechris/api-client',
    '../admin/postDraft',
    '../notebook/taskDraft',
    '../workspace/ui/SaveIndicator',
    '../auth/config',
    '../../workspace/auth/session',
  ])(
    'forbids %s',
    async (specifier) => {
      expect(await lintKitImport(specifier)).not.toHaveLength(0);
    },
    30_000,
  );

  it.each([
    'react',
    'react-router-dom',
    '@gagnechris/shared',
    '@gagnechris/shared/render',
    './Button',
    '../lib/ulid',
  ])(
    'allows %s',
    async (specifier) => {
      expect(await lintKitImport(specifier)).toEqual([]);
    },
    30_000,
  );
});
