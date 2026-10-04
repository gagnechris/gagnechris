// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkWebShells,
  demoChunkProblems,
} from '../../scripts/checkWebShells';

const GA_SNIPPET = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>
<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}</script>`;
const FONT_BYTES = 'wOF2';
const FONT_HASH = createHash('sha256')
  .update(FONT_BYTES)
  .digest('hex')
  .slice(0, 8);
const FONT = `/fonts/serif.${FONT_HASH}.woff2`;
const FONT_PRELOAD = `<link rel="preload" href="${FONT}" as="font" type="font/woff2" crossorigin />`;
const APP_SHELL = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/main-abc123.js"></script>
</head><body><div id="root"></div></body></html>`;

const ENTRY = {
  file: 'assets/index-abc.js',
  src: 'index.html',
  isEntry: true,
  imports: ['_shared-abc.js'],
  dynamicImports: ['src/demos/posts/index.tsx'],
};
const MANIFEST = {
  'index.html': ENTRY,
  '_shared-abc.js': { file: 'assets/shared-abc.js' },
  'src/demos/posts/index.tsx': {
    file: 'assets/index-def.js',
    src: 'src/demos/posts/index.tsx',
    isDynamicEntry: true,
    imports: ['index.html', '_shared-abc.js'],
  },
};
const POSTS_DEMO = 'src/demos/posts/index.tsx';

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

function webRoot(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-shells-'));
  roots.push(root);
  const all: Record<string, string> = {
    'dist/index.html': `<html><head>${GA_SNIPPET}</head></html>`,
    'dist/_shell.html': `<html><head>${FONT_PRELOAD}${GA_SNIPPET}</head></html>`,
    [`dist${FONT}`]: FONT_BYTES,
    'dist/assets/index-abc.css': `@font-face{font-family:Serif;src:url('${FONT}') format('woff2')}`,
    'dist/.vite/manifest.json': JSON.stringify(MANIFEST),
    'dist-admin/index.html': APP_SHELL,
    'dist-notebook/index.html': APP_SHELL,
    'dist-notebook/manifest.json': JSON.stringify({
      id: '/',
      start_url: '/',
      scope: '/',
    }),
    ...files,
  };
  for (const [rel, body] of Object.entries(all)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (body !== '\0delete') fs.writeFileSync(file, body);
  }
  return root;
}

describe('checkWebShells', () => {
  it('passes GA on the public shell and bundled scripts only on app shells', () => {
    expect(checkWebShells(webRoot({}))).toEqual([]);
  });

  it.each(['dist-admin', 'dist-notebook'])(
    'fails when %s/index.html loads GA',
    (app) => {
      const problems = checkWebShells(
        webRoot({
          [`${app}/index.html`]: APP_SHELL.replace(
            '</head>',
            `${GA_SNIPPET}</head>`,
          ),
        }),
      );
      expect(problems).toContain(
        `${app}/index.html references Google Analytics`,
      );
      expect(problems).toContain(`${app}/index.html has an inline <script>`);
    },
  );

  it('fails on an inline script in an app shell even without GA', () => {
    const problems = checkWebShells(
      webRoot({
        'dist-admin/index.html': APP_SHELL.replace(
          '</head>',
          '<script>window.x = 1</script></head>',
        ),
      }),
    );
    expect(problems).toEqual(['dist-admin/index.html has an inline <script>']);
  });

  it('fails on a third-party script src in an app shell', () => {
    const problems = checkWebShells(
      webRoot({
        'dist-notebook/index.html': APP_SHELL.replace(
          '</head>',
          '<script src="https://cdn.example.com/x.js"></script></head>',
        ),
      }),
    );
    expect(problems).toEqual([
      'dist-notebook/index.html loads a script that is not bundled: https://cdn.example.com/x.js',
    ]);
  });

  it('fails when the public shell loses GA', () => {
    const problems = checkWebShells(
      webRoot({ 'dist/index.html': '<html></html>' }),
    );
    expect(problems).toEqual(['dist/index.html lost Google Analytics']);
  });

  it('fails when the Notebook manifest is not scoped to its own origin root', () => {
    const problems = checkWebShells(
      webRoot({
        'dist-notebook/manifest.json': JSON.stringify({
          id: '/admin/notebook',
          start_url: '/admin/notebook',
          scope: '/admin/',
        }),
      }),
    );
    expect(problems).toHaveLength(3);
  });

  it('fails unless the public shell preloads exactly one self-hosted font', () => {
    expect(
      checkWebShells(
        webRoot({
          'dist/_shell.html': `<html><head>${GA_SNIPPET}</head></html>`,
        }),
      ),
    ).toContain('dist/_shell.html preloads 0 fonts (expected 1)');
    expect(
      checkWebShells(
        webRoot({
          'dist/_shell.html': `<html><head>${FONT_PRELOAD}${FONT_PRELOAD.replace('serif', 'sans')}${GA_SNIPPET}</head></html>`,
        }),
      ),
    ).toContain('dist/_shell.html preloads 2 fonts (expected 1)');
    expect(checkWebShells(webRoot({ [`dist${FONT}`]: '\0delete' }))).toContain(
      `dist/_shell.html preloads a font that is not in dist: ${FONT}`,
    );
  });

  it('accepts a Vite-hashed font under /assets/', () => {
    const font = '/assets/serif-AbC123.woff2';
    expect(
      checkWebShells(
        webRoot({
          [`dist${font}`]: FONT_BYTES,
          'dist/_shell.html': `<html><head>${FONT_PRELOAD.replace(FONT, font)}${GA_SNIPPET}</head></html>`,
          'dist/assets/index-abc.css': `@font-face{font-family:Serif;src:url('${font}') format('woff2')}`,
        }),
      ),
    ).toEqual([]);
  });

  it('fails when a font name does not carry a content hash, so it would not be cached as immutable', () => {
    const font = '/fonts/serif.woff2';
    const problems = checkWebShells(
      webRoot({
        [`dist${font}`]: FONT_BYTES,
        'dist/_shell.html': `<html><head>${FONT_PRELOAD.replace(FONT, font)}${GA_SNIPPET}</head></html>`,
        'dist/assets/index-abc.css': `@font-face{font-family:Serif;src:url('${font}') format('woff2')}`,
      }),
    );
    const reason =
      'is not a hashed /fonts/<name>.<sha256:8>.woff2 or /assets/ file';
    expect(problems).toEqual([
      `dist/_shell.html preloads a font that ${reason}: ${font}`,
      `assets/index-abc.css loads a font that ${reason}: ${font}`,
    ]);
  });

  it('fails when a font file changes but its name keeps the old hash', () => {
    const problems = checkWebShells(webRoot({ [`dist${FONT}`]: 'wOF2 v2' }));
    expect(problems).toHaveLength(2);
    for (const problem of problems) {
      expect(problem).toContain(
        `is named for hash ${FONT_HASH} but its content hashes to`,
      );
    }
  });

  it('fails when the public CSS loads a font from another origin', () => {
    const url = 'https://fonts.gstatic.com/s/inter/v1/inter.woff2';
    const problems = checkWebShells(
      webRoot({
        'dist/assets/index-abc.css': `@font-face{font-family:Inter;src:url(${url}) format('woff2')}`,
      }),
    );
    expect(problems).toEqual([
      `assets/index-abc.css loads a font that is not in dist: ${url}`,
    ]);
  });

  it('fails when the public build manifest is missing', () => {
    expect(
      checkWebShells(webRoot({ 'dist/.vite/manifest.json': '\0delete' })),
    ).toEqual(['dist/.vite/manifest.json is missing']);
  });
});

describe('demoChunkProblems', () => {
  it('passes a demo that is only a lazy chunk', () => {
    expect(demoChunkProblems(MANIFEST, [POSTS_DEMO])).toEqual([]);
  });

  it('fails when the entry imports a demo statically', () => {
    const manifest = {
      ...MANIFEST,
      'index.html': {
        ...ENTRY,
        imports: [...ENTRY.imports, POSTS_DEMO],
        dynamicImports: [],
      },
      [POSTS_DEMO]: { ...MANIFEST[POSTS_DEMO], isDynamicEntry: false },
    };
    expect(demoChunkProblems(manifest, [POSTS_DEMO])).toEqual([
      `${POSTS_DEMO} is statically imported by the public entry`,
      `${POSTS_DEMO} is not loaded with a dynamic import()`,
    ]);
  });

  it('fails when the test-only fixture demo made it into the build', () => {
    const fixture = 'src/__tests__/fixtures/demo/FixtureDemo.tsx';
    const manifest = {
      ...MANIFEST,
      [fixture]: { file: 'assets/fx.js', src: fixture, isDynamicEntry: true },
    };
    expect(demoChunkProblems(manifest, [POSTS_DEMO])).toEqual([
      `${fixture} is test-only but has a chunk in the build`,
    ]);
  });

  it('fails when a demo was bundled into another chunk', () => {
    const { [POSTS_DEMO]: _, ...manifest } = MANIFEST;
    expect(demoChunkProblems(manifest, [POSTS_DEMO])).toEqual([
      `${POSTS_DEMO} has no chunk of its own (bundled into another)`,
    ]);
  });

  it('fails when a shared chunk on the static graph is a demo', () => {
    const manifest = {
      ...MANIFEST,
      '_shared-abc.js': {
        file: 'assets/shared-abc.js',
        imports: ['src/demos/notebook/index.tsx'],
      },
      'src/demos/notebook/index.tsx': {
        file: 'assets/nb.js',
        src: 'src/demos/notebook/index.tsx',
        isDynamicEntry: true,
      },
    };
    expect(demoChunkProblems(manifest, [])).toEqual([
      'src/demos/notebook/index.tsx is statically imported by the public entry',
    ]);
  });
});
