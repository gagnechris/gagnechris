import { describe, expect, it } from 'vitest';
import {
  edgePipeline,
  loadViewerRequest,
  loadViewerResponse,
  type CfResponse as Response,
} from '../lib/cloudfront/harness.js';

const NOT_FOUND_PAGE = '<html><h1>Page not found</h1></html>';

/** Both edge functions around an S3 origin holding `objects` and a KVS holding `keys`. */
function edge(objects: Set<string>, keys: string[]) {
  const run = edgePipeline({
    viewerRequest: loadViewerRequest({
      kvs: { exists: async (k) => keys.includes(k) },
    }).handler,
    viewerResponse: loadViewerResponse(),
    origin: async (uri) => {
      const key = uri.replace(/^\//, '');
      if (!objects.has(key)) return null;
      return {
        kind: 'text',
        contentType: 'text/html; charset=utf-8',
        body: key === '404.html' ? NOT_FOUND_PAGE : `<html>${key}</html>`,
      };
    },
  });
  return async (uri: string): Promise<Response> => {
    const result = await run({
      uri,
      headers: { host: { value: 'gagnechris.com' } },
    });
    if (result.kind !== 'response') throw new Error('unexpected binary');
    return result.response;
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
