// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const SOURCE_DIRS = [
  'apps/web/src',
  'packages/shared/src',
  'packages/app-core/src',
].map((dir) => path.join(repoRoot, dir));

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });

// The runtime's default locale, by omission or `undefined`.
const DEFAULT_LOCALE =
  /\.toLocale(?:Date|Time)?String\(\s*(?:undefined\b|\)|\{)|Intl\.DateTimeFormat\(\s*(?:undefined\b|\)|\{)/;

describe('locale policy (docs/architecture.md, "Dates and locale")', () => {
  it('formats no date with the runtime default locale', () => {
    const offenders = SOURCE_DIRS.flatMap(sourceFiles).flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          DEFAULT_LOCALE.test(line)
            ? [`${path.relative(repoRoot, file)}:${i + 1}`]
            : [],
        ),
    );
    expect(offenders).toEqual([]);
  });
});
