// @vitest-environment node
import path from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  bundleBoundaryPlugin,
  PUBLIC_FORBIDDEN_MODULES,
} from '../../scripts/bundleBoundaryPlugin';

const fixtures = path.resolve(__dirname, 'fixtures/bundle-boundary');

const bundle = (entry: string) =>
  build({
    configFile: false,
    logLevel: 'silent',
    root: fixtures,
    plugins: [bundleBoundaryPlugin()],
    build: {
      write: false,
      lib: { entry: path.join(fixtures, entry), formats: ['es'] },
    },
  });

describe('public bundle boundary', () => {
  it('passes a bundle with only public modules', async () => {
    await expect(bundle('clean.ts')).resolves.toBeDefined();
  });

  it('fails the build when any chunk, even a lazy one, has a workspace module', async () => {
    await expect(bundle('forbidden.ts')).rejects.toThrow(
      /Public bundle contains signed-in or auth modules:[\s\S]*src\/workspace\/api\/apiTarget\.ts/,
    );
  });

  it.each([
    '/repo/apps/web/src/admin/AdminLayout.tsx',
    '/repo/apps/web/src/notebook/NotebookShell.tsx',
    '/repo/apps/web/src/workspace/auth/session.ts',
    '/repo/apps/web/src/auth/config.ts',
    '/repo/node_modules/aws-amplify/dist/esm/index.mjs',
    '/repo/node_modules/@aws-amplify/auth/dist/esm/index.mjs',
    '/repo/packages/app-core/src/index.ts',
    '/repo/node_modules/@gagnechris/app-core/src/index.ts',
    '/repo/node_modules/@tanstack/react-query/build/modern/index.js',
  ])('forbids %s', (id) => {
    expect(PUBLIC_FORBIDDEN_MODULES.some((re) => re.test(id))).toBe(true);
  });

  it.each([
    '/repo/apps/web/src/pages/PostPage.tsx',
    '/repo/apps/web/src/lib/ulid.ts',
    '/repo/packages/shared/src/render.ts',
    '/repo/node_modules/react-router/dist/index.mjs',
  ])('allows %s', (id) => {
    expect(PUBLIC_FORBIDDEN_MODULES.some((re) => re.test(id))).toBe(false);
  });
});

describe('vite config', () => {
  it('runs the boundary guard on the public build', async () => {
    const { resolveConfig } = await import('vite');
    const previous = process.env.WEB_APP;
    process.env.WEB_APP = 'public';
    try {
      const config = await resolveConfig(
        { configFile: path.resolve(__dirname, '../../vite.config.ts') },
        'build',
      );
      expect(config.plugins.map((p) => p.name)).toContain('bundle-boundary');
    } finally {
      if (previous === undefined) delete process.env.WEB_APP;
      else process.env.WEB_APP = previous;
    }
  });
});
