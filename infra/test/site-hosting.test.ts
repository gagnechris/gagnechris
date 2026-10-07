import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { csp } from '../lib/constructs/site-hosting.js';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const HELPERS = 'constructs/site-hosting.ts';

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

const filesWith = (pattern: RegExp) =>
  sources(LIB)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(LIB, file));

describe('site hosting helpers', () => {
  it.each([
    ['the CSP directives', /script-src|connect-src/],
    ['the ListBucket grant', /AllowCloudFrontListBucket/],
    ['the 5xx alarm', /metric5xxErrorRate/],
    ['the distribution nag suppressions', /AwsSolutions-CFR1/],
    ['the security headers', /xssProtection/],
  ])('%s live only in the helpers', (_what, pattern) => {
    expect(filesWith(pattern)).toEqual([HELPERS]);
  });

  it('makes the site and app buckets PrivateSiteBuckets', () => {
    const count = (file: string, pattern: RegExp) =>
      readFileSync(join(LIB, file), 'utf8').match(pattern)?.length ?? 0;
    expect(count('stacks/site-stack.ts', /new PrivateSiteBucket\(/g)).toBe(1);
    expect(count('constructs/app-host.ts', /new PrivateSiteBucket\(/g)).toBe(1);
    // The access log bucket is the only other one.
    expect(count('stacks/site-stack.ts', /new Bucket\(/g)).toBe(1);
    expect(count('constructs/app-host.ts', /new Bucket\(/g)).toBe(0);
  });

  it('builds each host’s CSP from one base policy', () => {
    const base =
      "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";
    expect(csp({})).toBe(
      `${base}; script-src 'self'; img-src 'self' data:; connect-src 'self'`,
    );
    expect(
      csp({
        script: ['https://a.example'],
        img: ['https://b.example'],
        connect: ['https://c.example', 'https://d.example'],
      }),
    ).toBe(
      `${base}; script-src 'self' https://a.example; img-src 'self' data: https://b.example; connect-src 'self' https://c.example https://d.example`,
    );
  });
});
