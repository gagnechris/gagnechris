import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, slugify } from './slugify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('MAX_SLUG_LENGTH vs CloudFront (CHR-145)', () => {
  it('matches isValidBlogSlug max in the viewer-request function', () => {
    const fnSource = readFileSync(
      join(
        __dirname,
        '../../../infra/lib/cloudfront/viewer-request-function.js',
      ),
      'utf8',
    );
    const match = fnSource.match(/slug\.length\s*>\s*(\d+)/);
    expect(match?.[1]).toBe(String(MAX_SLUG_LENGTH));
  });

  it('slugifies a 200-character title within the edge allowlist', () => {
    const slug = slugify('Word '.repeat(40).trim());
    expect(slug.length).toBeGreaterThan(0);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(/^[a-z0-9-]+$/.test(slug)).toBe(true);
    expect(slug.endsWith('-')).toBe(false);
  });
});
