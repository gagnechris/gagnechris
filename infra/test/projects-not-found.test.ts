import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) =>
  readFileSync(join(here, `../lib/cloudfront/${name}`), 'utf8');

type Request = { uri: string; headers: { host: { value: string } } };
type Response = {
  statusCode: number;
  statusDescription?: string;
  headers: Record<string, { value: string }>;
  body?: string;
};

const viewerRequest = new Function(
  `var cf = { kvs: function () { throw new Error('no kvs'); } };
   ${source('viewer-request-function.js').replace(/import cf from 'cloudfront';\s*/g, '')}
   return handler;`,
)() as (event: { request: Request }) => Promise<Request | Response>;

const viewerResponse = new Function(
  `${source('viewer-response-function.js')}\nreturn handler;`,
)() as (event: { request: { uri: string }; response: Response }) => Response;

/** Both edge functions around an S3 origin that holds `objects`. */
async function get(uri: string, objects: Set<string>): Promise<Response> {
  const rewritten = await viewerRequest({
    request: { uri, headers: { host: { value: 'gagnechris.com' } } },
  });
  if ('statusCode' in rewritten) return rewritten;
  const key = rewritten.uri.replace(/^\//, '');
  const origin: Response = objects.has(key)
    ? {
        statusCode: 200,
        headers: { 'content-type': { value: 'text/html; charset=utf-8' } },
        body: `<html>${key}</html>`,
      }
    : {
        statusCode: 404,
        statusDescription: 'Not Found',
        headers: { 'content-type': { value: 'application/xml' } },
        body: '<Error><Code>NoSuchKey</Code></Error>',
      };
  return viewerResponse({ request: { uri: rewritten.uri }, response: origin });
}

describe('/projects at the edge', () => {
  const site = new Set(['projects/index.html', 'projects/notebook/index.html']);

  it('serves a published project page', async () => {
    const res = await get('/projects/notebook', site);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<html>projects/notebook/index.html</html>');
  });

  it('/projects/does-not-exist is the HTML 404 with status 404', async () => {
    const res = await get('/projects/does-not-exist', site);
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']?.value).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('Page not found');
    expect(res.body).not.toContain('NoSuchKey');
  });

  it('an unpublished project 404s the same way', async () => {
    const res = await get(
      '/projects/notebook',
      new Set(['projects/index.html']),
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Page not found');
  });
});
