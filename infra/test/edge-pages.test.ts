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

const NOT_FOUND_PAGE = '<html><h1>Page not found</h1></html>';

/** Both edge functions around an S3 origin holding `objects` and a KVS holding `keys`. */
function edge(objects: Set<string>, keys: string[]) {
  const viewerRequest = new Function(
    '__keys',
    `var cf = { kvs: function () {
       return { exists: async function (k) { return __keys.indexOf(k) !== -1; } };
     } };
     ${source('viewer-request-function.js').replace(/import cf from 'cloudfront';\s*/g, '')}
     return handler;`,
  )(keys) as (event: { request: Request }) => Promise<Request | Response>;
  const viewerResponse = new Function(
    `${source('viewer-response-function.js')}\nreturn handler;`,
  )() as (event: { request: { uri: string }; response: Response }) => Response;

  return async (uri: string): Promise<Response> => {
    const rewritten = await viewerRequest({
      request: { uri, headers: { host: { value: 'gagnechris.com' } } },
    });
    if ('statusCode' in rewritten) return rewritten;
    const key = rewritten.uri.replace(/^\//, '');
    if (!objects.has(key)) {
      // CloudFront skips viewer-response when the origin returns 4xx.
      return {
        statusCode: 404,
        headers: { 'content-type': { value: 'application/xml' } },
        body: '<Error><Code>NoSuchKey</Code></Error>',
      };
    }
    return viewerResponse({
      request: { uri: rewritten.uri },
      response: {
        statusCode: 200,
        headers: { 'content-type': { value: 'text/html; charset=utf-8' } },
        body: key === '404.html' ? NOT_FOUND_PAGE : `<html>${key}</html>`,
      },
    });
  };
}

const site = new Set([
  'index.html',
  '404.html',
  'blog/index.html',
  'blog/welcome/index.html',
  'contact/index.html',
  'dont-feed-the-bears/index.html',
  'dont-feed-the-bears/camp/index.html',
  'dont-feed-the-bears/wild/index.html',
  'projects/index.html',
  'projects/notebook/index.html',
  'resume/index.html',
]);
const synced = [
  'welcome',
  '__synced__',
  'projects/notebook',
  'projects/__synced__',
];

describe('page URLs at the edge', () => {
  const get = edge(site, synced);

  for (const uri of [
    '/projects/x',
    '/resume/x',
    '/contact/x',
    '/dont-feed-the-bears/x',
    '/dont-feed-the-bears/camp/x',
    '/x.html',
    '/posts/x',
    '/posts/welcome/x',
    '/nope',
  ]) {
    it(`${uri} is the HTML 404 with status 404`, async () => {
      const res = await get(uri);
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe(NOT_FOUND_PAGE);
    });
  }

  for (const [uri, key] of [
    ['/', 'index.html'],
    ['/posts', 'blog/index.html'],
    ['/posts/welcome/', 'blog/welcome/index.html'],
    ['/resume', 'resume/index.html'],
    ['/contact/', 'contact/index.html'],
    ['/dont-feed-the-bears', 'dont-feed-the-bears/index.html'],
    ['/dont-feed-the-bears/camp/', 'dont-feed-the-bears/camp/index.html'],
    ['/dont-feed-the-bears/wild/', 'dont-feed-the-bears/wild/index.html'],
    ['/projects', 'projects/index.html'],
    ['/projects/', 'projects/index.html'],
    ['/projects/notebook', 'projects/notebook/index.html'],
  ]) {
    it(`${uri} serves ${key}`, async () => {
      const res = await get(uri!);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(`<html>${key}</html>`);
    });
  }

  it('an unpublished project 404s once the publisher drops its key', async () => {
    const res = await edge(
      new Set([...site].filter((k) => k !== 'projects/notebook/index.html')),
      synced.filter((k) => k !== 'projects/notebook'),
    )('/projects/notebook');
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(NOT_FOUND_PAGE);
  });
});
