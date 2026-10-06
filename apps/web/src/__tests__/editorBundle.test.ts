// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Plugin, PluginOption, UserConfig } from 'vite';
import {
  ADMIN_EDITOR_BUDGET,
  editorBundleProblems,
  type BundleChunk,
} from '../../scripts/editorBundlePlugin';
import viteConfig from '../../vite.config';

const WEB = '/repo/apps/web';
const NM = '/repo/node_modules';

const chunk = (
  fileName: string,
  gzipBytes: number,
  opts: Partial<BundleChunk> = {},
): BundleChunk => ({
  fileName,
  isEntry: false,
  facadeModuleId: null,
  imports: [],
  moduleIds: [],
  gzipBytes,
  ...opts,
});

const KB = 1024;

const adminBundle = (overrides: Record<string, Partial<BundleChunk>> = {}) => {
  const chunks = [
    chunk('entry.js', 60 * KB, {
      isEntry: true,
      imports: ['react.js'],
      moduleIds: [`${WEB}/src/admin/main.tsx`],
    }),
    chunk('react.js', 50 * KB),
    chunk('layout.js', 40 * KB, {
      facadeModuleId: `${WEB}/src/admin/AdminLayout.tsx`,
      imports: ['react.js', 'zod.js'],
    }),
    chunk('zod.js', 45 * KB),
    chunk('post.js', 3 * KB, {
      facadeModuleId: `${WEB}/src/admin/PostEditorPage.tsx`,
      imports: ['view.js', 'zod.js', 'editor.js'],
    }),
    chunk('project.js', 3 * KB, {
      facadeModuleId: `${WEB}/src/admin/ProjectEditorPage.tsx`,
      imports: ['view.js', 'editor.js'],
    }),
    chunk('view.js', 70 * KB, {
      moduleIds: [`${NM}/@codemirror/view/dist/index.js`],
    }),
    chunk('editor.js', 22 * KB, {
      facadeModuleId: `${WEB}/src/kit/markdown/MarkdownEditor.tsx`,
      imports: ['view.js'],
      moduleIds: [`${NM}/@codemirror/commands/dist/index.js`],
    }),
    chunk('preview.js', 26 * KB, {
      facadeModuleId: `${WEB}/src/admin/editor/BodyPreview.tsx`,
      moduleIds: [
        `${NM}/marked/lib/marked.esm.js`,
        `${NM}/dompurify/dist/purify.es.mjs`,
      ],
    }),
  ];
  return chunks.map((c) => ({ ...c, ...overrides[c.fileName] }));
};

describe('editor bundle check', () => {
  it('passes editors that load CodeMirror and leave Preview lazy', () => {
    expect(editorBundleProblems(adminBundle(), ADMIN_EDITOR_BUDGET)).toEqual(
      [],
    );
  });

  it('counts what an editor adds after the entry and layout', () => {
    const problems = editorBundleProblems(adminBundle(), {
      ...ADMIN_EDITOR_BUDGET,
      maxGzipBytes: 90 * KB,
    });
    expect(problems).toEqual([
      'opening src/admin/PostEditorPage.tsx downloads 95.0 KB gzipped (budget 90.0 KB): view.js 70.0 KB, editor.js 22.0 KB, post.js 3.0 KB',
      'opening src/admin/ProjectEditorPage.tsx downloads 95.0 KB gzipped (budget 90.0 KB): view.js 70.0 KB, editor.js 22.0 KB, project.js 3.0 KB',
    ]);
  });

  it('fails when an editor statically pulls in marked or the sanitizer', () => {
    const problems = editorBundleProblems(
      adminBundle({
        'post.js': { imports: ['view.js', 'editor.js', 'preview.js'] },
        'preview.js': { gzipBytes: 1 * KB },
      }),
      ADMIN_EDITOR_BUDGET,
    );
    expect(problems).toEqual([
      'opening src/admin/PostEditorPage.tsx downloads marked (in preview.js)',
      'opening src/admin/PostEditorPage.tsx downloads dompurify (in preview.js)',
    ]);
  });

  it.each([
    ['@uiw/react-codemirror', 'esm/index.js'],
    ['@codemirror/autocomplete', 'dist/index.js'],
    ['@codemirror/search', 'dist/index.js'],
    ['@codemirror/lint', 'dist/index.js'],
    ['@codemirror/theme-one-dark', 'dist/index.js'],
    ['sanitize-html', 'index.js'],
    ['postcss', 'lib/postcss.js'],
  ])(
    'fails on %s anywhere in the bundle, even without a budget',
    (name, file) => {
      const bundle = adminBundle({
        'preview.js': { moduleIds: [`${NM}/${name}/${file}`] },
      });
      expect(editorBundleProblems(bundle, null)).toEqual([
        `${name} is in preview.js`,
      ]);
    },
  );

  it('fails when an editor route has no chunk of its own', () => {
    const bundle = adminBundle().filter((c) => c.fileName !== 'project.js');
    expect(editorBundleProblems(bundle, ADMIN_EDITOR_BUDGET)).toEqual([
      'no chunk for src/admin/ProjectEditorPage.tsx',
    ]);
  });

  it('runs on every web build, with the editor budget on the admin one', () => {
    const budgets = (['public', 'admin', 'notebook'] as const).map((app) => {
      vi.stubEnv('WEB_APP', app);
      vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_x');
      vi.stubEnv('VITE_COGNITO_AUTH_DOMAIN', 'auth.example.com');
      vi.stubEnv('VITE_COGNITO_ADMIN_CLIENT_ID', 'x');
      vi.stubEnv('VITE_COGNITO_NOTEBOOK_CLIENT_ID', 'x');
      const config = (
        viteConfig as (env: { command: string; mode: string }) => UserConfig
      )({ command: 'build', mode: 'production' });
      vi.unstubAllEnvs();
      return ((config.plugins ?? []) as PluginOption[])
        .flat()
        .filter((p): p is Plugin => Boolean(p && 'name' in p))
        .find((p) => p.name === 'editor-bundle')?.api?.budget;
    });
    expect(budgets).toEqual([null, ADMIN_EDITOR_BUDGET, null]);
  });
});
