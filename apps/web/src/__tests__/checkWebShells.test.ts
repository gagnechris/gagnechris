// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkWebShells } from '../../scripts/checkWebShells';

const GA_SNIPPET = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>
<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}</script>`;
const APP_SHELL = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/main-abc123.js"></script>
</head><body><div id="root"></div></body></html>`;

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
    'dist/_shell.html': `<html><head>${GA_SNIPPET}</head></html>`,
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
});
