import { describe, expect, it } from 'vitest';
import {
  loadViewerResponse,
  functionSource,
  type CfResponse,
} from '../lib/cloudfront/harness.js';

const handler = loadViewerResponse();

function runHandler(uri: string, response: CfResponse): CfResponse {
  return handler({ request: { uri }, response });
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

  it('has no inline 404 page: CloudFront never runs it on an origin 4xx', () => {
    expect(functionSource('viewer-response-function.js')).not.toContain(
      'NOT_FOUND_HTML',
    );
    const xml: CfResponse = {
      statusCode: 404,
      headers: { 'content-type': { value: 'application/xml' } },
      body: '<Error><Code>NoSuchKey</Code></Error>',
    };
    expect(runHandler('/resume/x/index.html', { ...xml })).toEqual(xml);
  });
});
