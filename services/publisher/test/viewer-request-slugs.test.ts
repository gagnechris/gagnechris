import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildViewerRequestSource,
  viewerRequestTemplatePath,
} from '../src/viewer-request-slugs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('buildViewerRequestSource', () => {
  it('injects a slug allowlist into the viewer-request template', () => {
    const template = readFileSync(
      join(__dirname, '../../../infra/lib/cloudfront/viewer-request-function.js'),
      'utf8',
    );
    expect(viewerRequestTemplatePath()).toContain('viewer-request-function.js');

    const source = buildViewerRequestSource(template, ['welcome', 'hello']);
    expect(source).toContain(
      'var PUBLISHED_BLOG_SLUGS = {"welcome":1,"hello":1}; /*__PUBLISHED_BLOG_SLUGS__*/',
    );
    expect(source).not.toContain('var PUBLISHED_BLOG_SLUGS = null;');

    // eslint-disable-next-line no-new-func -- load rewritten CF Function
    const api = new Function(
      `${source}\nreturn { handler, setPublishedBlogSlugsForTests };`,
    )() as {
      handler: (e: {
        request: { uri: string; headers: { host: { value: string } } };
      }) => { uri: string };
    };

    expect(
      api.handler({
        request: {
          uri: '/blog/welcome',
          headers: { host: { value: 'gagnechris.com' } },
        },
      }).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      api.handler({
        request: {
          uri: '/blog/typo',
          headers: { host: { value: 'gagnechris.com' } },
        },
      }).uri,
    ).toBe('/404.html');
  });

  it('writes an empty map when there are no published posts', () => {
    const template = 'var PUBLISHED_BLOG_SLUGS = null; /*__PUBLISHED_BLOG_SLUGS__*/\n';
    expect(buildViewerRequestSource(template, [])).toBe(
      'var PUBLISHED_BLOG_SLUGS = {}; /*__PUBLISHED_BLOG_SLUGS__*/\n',
    );
  });
});
