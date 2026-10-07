import { describe, expect, it } from 'vitest';
import {
  loadViewerRequest,
  type CfRequest,
} from '@gagnechris/infra/cloudfront-harness';
import {
  STATIC_PAGE_META,
  outputRelativePath,
} from '../../scripts/staticPageMeta';

const viewerRequest = loadViewerRequest().handler;

const routed = async (uri: string) =>
  (
    (await viewerRequest({
      request: { uri, headers: { host: { value: 'gagnechris.com' } } },
    })) as CfRequest
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
