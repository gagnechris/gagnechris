import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fnSource = readFileSync(
  join(__dirname, '../lib/cloudfront/viewer-response-function.js'),
  'utf8',
);

type CfHeaders = Record<string, { value: string }>;

type CfResponse = {
  statusCode: number;
  statusDescription?: string;
  headers: CfHeaders;
  body?: string;
};

function runHandler(uri: string, response: CfResponse): CfResponse {
  const run = new Function(`${fnSource}\nreturn handler;`)() as (event: {
    request: { uri: string };
    response: CfResponse;
  }) => CfResponse;
  return run({ request: { uri }, response });
}

describe('viewer-response CloudFront Function', () => {
  it('forces HTTP 404 when serving /404.html', () => {
    const res = runHandler('/404.html', {
      statusCode: 200,
      statusDescription: 'OK',
      headers: {
        'content-type': { value: 'text/html; charset=utf-8' },
      },
      body: '<html>not found page</html>',
    });
    expect(res.statusCode).toBe(404);
    expect(res.statusDescription).toBe('Not Found');
    expect(res.body).toBe('<html>not found page</html>');
  });

  it('serves inline HTML NotFound for cached /404.html (304) instead of a blank body', () => {
    const res = runHandler('/404.html', {
      statusCode: 304,
      statusDescription: 'Not Modified',
      headers: {
        etag: { value: '"abc"' },
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.statusDescription).toBe('Not Found');
    expect(res.body).toContain('Page not found');
    expect(res.headers['cache-control'].value).toBe('no-cache');
  });

  it('strips validators and sets no-cache when forcing 404 from /404.html 200', () => {
    const res = runHandler('/404.html', {
      statusCode: 200,
      statusDescription: 'OK',
      headers: {
        'content-type': { value: 'text/html; charset=utf-8' },
        etag: { value: '"abc"' },
        'last-modified': { value: 'Wed, 01 Jan 2020 00:00:00 GMT' },
      },
      body: '<html>not found page</html>',
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('<html>not found page</html>');
    expect(res.headers['cache-control'].value).toBe('no-cache');
    expect(res.headers.etag).toBeUndefined();
    expect(res.headers['last-modified']).toBeUndefined();
  });

  it('replaces S3 XML 404 with HTML NotFound', () => {
    const res = runHandler('/blog/typo/index.html', {
      statusCode: 404,
      statusDescription: 'Not Found',
      headers: {
        'content-type': { value: 'application/xml' },
      },
      body: '<Error><Code>NoSuchKey</Code></Error>',
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type'].value).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('Page Not Found');
    expect(res.body).toContain('noindex');
    expect(res.body).not.toContain('NoSuchKey');
  });

  it('replaces S3 404 with empty content-type (treat as XML-like)', () => {
    const res = runHandler('/blog/missing/index.html', {
      statusCode: 404,
      headers: {},
      body: '<Error><Code>NoSuchKey</Code></Error>',
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type'].value).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('Page not found');
  });

  it('replaces S3 XML 403 with HTML NotFound', () => {
    const res = runHandler('/blog/draft/index.html', {
      statusCode: 403,
      statusDescription: 'Forbidden',
      headers: {
        'content-type': { value: 'application/xml' },
      },
      body: '<Error><Code>AccessDenied</Code></Error>',
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Page not found');
  });

  it('leaves successful HTML responses alone', () => {
    const res = runHandler('/blog/welcome/index.html', {
      statusCode: 200,
      headers: {
        'content-type': { value: 'text/html; charset=utf-8' },
      },
      body: '<html>welcome</html>',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<html>welcome</html>');
  });

  it('does not rewrite non-XML application/json 404 bodies', () => {
    const res = runHandler('/some/key.json', {
      statusCode: 404,
      headers: {
        'content-type': { value: 'application/json' },
      },
      body: '{"error":"not_found"}',
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('{"error":"not_found"}');
  });
});
