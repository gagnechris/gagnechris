// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

// Markup comes from app and package source, the publisher and the Go API;
// tests, stories and e2e specs only look for it.
const markup = tracked
  .filter(
    (f) =>
      /\.(tsx?|html|go)$/.test(f) &&
      !/\.test\.|\/test\/|\.stories\.|^e2e\/|^apps\/mobile\//.test(f),
  )
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');

const classesIn = (css: string) =>
  new Set(
    [
      ...css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/\.(-?[_a-zA-Z][\w-]*)/g),
    ].map((m) => m[1]!),
  );

// A class built in a template literal, like `admin-stage--${stage}`.
const builtFrom = (name: string) =>
  [...name].some(
    (ch, i) =>
      i > 0 && /[-_]/.test(ch) && markup.includes(`${name.slice(0, i + 1)}\${`),
  );

describe('web stylesheets', () => {
  it('style only classes some source file writes', () => {
    const unused = tracked
      .filter((f) => f.startsWith('apps/web/src/') && f.endsWith('.css'))
      .flatMap((file) =>
        [...classesIn(fs.readFileSync(path.join(ROOT, file), 'utf8'))]
          // CodeMirror writes its own `cm-*` classes.
          .filter((name) => !name.startsWith('cm-'))
          .filter((name) => !markup.includes(name) && !builtFrom(name))
          .map((name) => `${file}: .${name}`),
      );
    expect(unused).toEqual([]);
  });
});
