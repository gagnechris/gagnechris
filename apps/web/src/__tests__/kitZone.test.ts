// @vitest-environment node
import { readdirSync } from 'node:fs';
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
    '../api/public-client',
    '../utils/analytics',
    '../../utils/analytics',
    '../pages/PostPage',
    '../components/SiteLink',
    '../prerender/documentPrerender',
    '../demos/notebook/NotebookDemo',
    '../App',
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

  const appDirs = readdirSync(path.join(repoRoot, 'apps/web/src'), {
    withFileTypes: true,
  })
    .filter((e) => e.isDirectory() && !['kit', 'lib'].includes(e.name))
    .map((e) => e.name);

  it.each(appDirs)(
    'forbids every app directory: %s',
    async (dir) => {
      expect(await lintKitImport(`../${dir}/anything`)).not.toHaveLength(0);
    },
    30_000,
  );

  // The public Notebook demo renders Today from these with its own reducer.
  it.each(['tasks/TodayPanels.tsx', 'tasks/SnoozeMenu.tsx'])(
    '%s stays inside the zone',
    async (file) => {
      const [result] = await eslint.lintFiles([
        path.join(repoRoot, 'apps/web/src/kit', file),
      ]);
      expect(
        result!.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
      ).toEqual([]);
      expect(result!.filePath).toContain(`${path.sep}kit${path.sep}`);
    },
    30_000,
  );
});
