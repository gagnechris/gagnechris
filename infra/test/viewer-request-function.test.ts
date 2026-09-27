import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fnSource = readFileSync(
  join(__dirname, '../lib/cloudfront/viewer-request-function.js'),
  'utf8',
);

type CfRequest = {
  uri: string;
  querystring?: Record<
    string,
    { value?: string; multiValue?: Array<{ value: string }> }
  >;
  headers: { host: { value: string } };
};

type CfResponse =
  | CfRequest
  | {
      statusCode: number;
      statusDescription: string;
      headers: { location: { value: string } };
    };

function runHandler(request: CfRequest): CfResponse {
  // CloudFront Functions expose handler(event); eval in a sandbox.
  // eslint-disable-next-line no-new-func -- intentional: load CF Function source
  const run = new Function(
    `${fnSource}\nreturn handler;`,
  )() as (event: { request: CfRequest }) => CfResponse;
  return run({ request });
}

function locationOf(res: CfResponse): string {
  return (res as { headers: { location: { value: string } } }).headers.location
    .value;
}

describe('viewer-request CloudFront Function', () => {
  it('redirects www to apex without a query string', () => {
    const res = runHandler({
      uri: '/blog',
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(res).toMatchObject({
      statusCode: 301,
      headers: { location: { value: 'https://gagnechris.com/blog' } },
    });
  });

  it('preserves a single query parameter on www redirect', () => {
    const res = runHandler({
      uri: '/blog',
      querystring: { utm_source: { value: 'linkedin' } },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/blog?utm_source=linkedin',
    );
  });

  it('preserves multiple query parameters on www redirect', () => {
    const res = runHandler({
      uri: '/blog',
      querystring: {
        utm_source: { value: 'x' },
        a: { value: '1' },
      },
      headers: { host: { value: 'WWW.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/blog?utm_source=x&a=1',
    );
  });

  it('passes through already-encoded query values (no double-encoding)', () => {
    const res = runHandler({
      uri: '/blog',
      querystring: {
        q: { value: 'a%20b' },
        x: { value: '%2Fpath%3Fz%26y' },
      },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/blog?q=a%20b&x=%2Fpath%3Fz%26y',
    );
  });

  it('preserves multi-value query keys as received', () => {
    const res = runHandler({
      uri: '/',
      querystring: {
        tag: {
          multiValue: [{ value: 'a' }, { value: 'b' }],
        },
      },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe('https://gagnechris.com/?tag=a&tag=b');
  });

  it('rewrites /blog paths to Option B index.html objects', () => {
    expect(
      (
        runHandler({
          uri: '/blog',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/blog/index.html');
    expect(
      (
        runHandler({
          uri: '/blog/',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/blog/index.html');
    expect(
      (
        runHandler({
          uri: '/blog/welcome',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      (
        runHandler({
          uri: '/blog/welcome/',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      (
        runHandler({
          uri: '/blog/posts.json',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/blog/posts.json');
  });

  it('rewrites /resume and /contact to Option B index.html objects', () => {
    expect(
      (
        runHandler({
          uri: '/resume',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/resume/index.html');
    expect(
      (
        runHandler({
          uri: '/resume/',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/resume/index.html');
    expect(
      (
        runHandler({
          uri: '/contact',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/contact/index.html');
    expect(
      (
        runHandler({
          uri: '/contact/',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/contact/index.html');
  });

  it('rewrites other extensionless deep links to the SPA shell', () => {
    for (const uri of ['/auth/callback', '/admin', '/admin/posts']) {
      const req = runHandler({
        uri,
        headers: { host: { value: 'gagnechris.com' } },
      }) as CfRequest;
      expect(req.uri).toBe('/index.html');
    }
  });

  it('rewrites trailing-slash SPA paths to the SPA shell', () => {
    const req = runHandler({
      uri: '/admin/',
      headers: { host: { value: 'gagnechris.com' } },
    }) as CfRequest;
    expect(req.uri).toBe('/index.html');
  });

  it('does not rewrite /api or /media paths', () => {
    expect(
      (
        runHandler({
          uri: '/api/nope',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/api/nope');
    expect(
      (
        runHandler({
          uri: '/media/photo.png',
          headers: { host: { value: 'gagnechris.com' } },
        }) as CfRequest
      ).uri,
    ).toBe('/media/photo.png');
  });

  it('passes through paths with a file extension', () => {
    const req = runHandler({
      uri: '/assets/app.js',
      headers: { host: { value: 'gagnechris.com' } },
    }) as CfRequest;
    expect(req.uri).toBe('/assets/app.js');
  });
});
