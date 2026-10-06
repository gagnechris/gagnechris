// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/**
 * Public-app source: the signed-in apps and tests are out of scope. So are the
 * lazy bears chunks: importing the shared site helpers from them makes
 * Rolldown split `site-config` out of the public entry into its own chunk.
 */
const publicSource = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return /^(admin|notebook|workspace|__tests__|games)$/.test(entry.name)
        ? []
        : publicSource(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });

const files = [
  ...publicSource(path.join(webRoot, 'src')),
  path.join(webRoot, 'scripts/staticPageMeta.ts'),
];

const offenders = (re: RegExp, among = files) =>
  among
    .filter((file) => re.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(webRoot, file));

describe('public pages', () => {
  it('build canonicals with siteUrl, not a hard-coded origin', () => {
    expect(offenders(/['"`]https:\/\/gagnechris\.com/)).toEqual([]);
  });

  it('build titles with pageTitle, not a hard-coded author suffix', () => {
    expect(offenders(/ - Chris Gagne['"`]/)).toEqual([]);
  });

  it('decide site paths with isSitePath and render links with SiteLink', () => {
    const components = files.filter((file) =>
      file.includes(`${path.sep}src${path.sep}`),
    );
    expect(offenders(/startsWith\(['"]\/\/?['"]\)/, components)).toEqual([]);
    expect(
      offenders(/if \(link\.kind === 'spa'\)|\{spa \?/, components),
    ).toEqual([]);
  });
});
