// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = path.resolve(__dirname, '..');
const SELF = path.join(src, '__tests__', 'adminClassZone.test.ts');

// Cognito client ids, and a class routeChunks.test asserts is never used.
const NOT_CLASSES = new Set(['admin-web', 'admin-client', 'admin-loading']);

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(css|tsx?)$/.test(entry.name) ? [full] : [];
  });

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const adminClassesOutsideAdmin = (files: string[]) =>
  files
    .filter((file) => !file.startsWith(path.join(src, 'admin') + path.sep))
    .filter((file) => file !== SELF)
    .flatMap((file) =>
      [
        ...stripComments(fs.readFileSync(file, 'utf8')).matchAll(
          /(?<![\w-])admin-[a-z][\w-]*/g,
        ),
      ]
        .map((m) => m[0])
        .filter((name) => !NOT_CLASSES.has(name))
        .map((name) => `${path.relative(src, file)}: ${name}`),
    );

describe('admin-* classes', () => {
  it('are used only under src/admin', () => {
    expect(adminClassesOutsideAdmin(sourceFiles(src))).toEqual([]);
  });

  it('are caught in a stylesheet or component', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-zone-'));
    try {
      const sheet = path.join(dir, 'probe.css');
      const component = path.join(dir, 'Probe.tsx');
      fs.writeFileSync(sheet, '.admin-hint { color: red; }\n');
      fs.writeFileSync(component, 'export const c = "kit-btn admin-btn";\n');
      expect(adminClassesOutsideAdmin([sheet, component])).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
