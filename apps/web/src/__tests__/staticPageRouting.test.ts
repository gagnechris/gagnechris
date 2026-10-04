import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STATIC_PAGE_META,
  outputRelativePath,
} from '../../scripts/staticPageMeta';

type Request = { uri: string; headers: Record<string, { value: string }> };

const viewerRequest = new Function(
  `var cf = { kvs: function () { throw new Error('no kvs'); } };
   ${fs
     .readFileSync(
       path.resolve(
         __dirname,
         '../../../../infra/lib/cloudfront/viewer-request-function.js',
       ),
       'utf8',
     )
     .replace(/import cf from 'cloudfront';\s*/g, '')}
   return handler;`,
)() as (event: { request: Request }) => Promise<Request>;

const routed = async (uri: string) =>
  (
    await viewerRequest({
      request: { uri, headers: { host: { value: 'gagnechris.com' } } },
    })
  ).uri;

// The CloudFront allowlist (STATIC_OPTION_B_PAGES in the publisher) must name
// every page the Vite build writes, or that page is the 404.
describe('every static page is served at the edge', () => {
  for (const { routePath } of STATIC_PAGE_META.filter((m) => m.routePath)) {
    it(`/${routePath}`, async () => {
      const object = `/${outputRelativePath(routePath)}`;
      expect(await routed(`/${routePath}`)).toBe(object);
      expect(await routed(`/${routePath}/`)).toBe(object);
      expect(await routed(`/${routePath}/no-such-page`)).toBe('/404.html');
    });
  }
});
