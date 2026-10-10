import type { ReactNode } from 'react';
import {
  createRoot,
  hydrateRoot,
  type Root,
  type RootOptions,
} from 'react-dom/client';

// Pages whose prerender comes from @gagnechris/public-ui. Every other page's
// React twin only matches its string renderer after normalising, so it still
// replaces the prerender.
const HYDRATED_PAGES: readonly { path: RegExp; selector: string }[] = [
  { path: /^\/posts\/?$/, selector: 'main.posts-index' },
  { path: /^\/contact\/?$/, selector: 'main.contact-page' },
  // 404.html answers any path CloudFront has no object for.
  { path: /^\//, selector: 'main.not-found' },
  // Their pages load in a lazy chunk, so the published page is the chrome alone.
  {
    path: /^\/dont-feed-the-bears(\/(camp|wild))?\/?$/,
    selector: 'header.site-header + footer.site-footer',
  },
];

export const hydratesPrerender = (
  container: Element,
  pathname: string,
): boolean =>
  HYDRATED_PAGES.some(
    ({ path, selector }) =>
      path.test(pathname) &&
      container.querySelector(`:scope > ${selector}`) !== null,
  );

export function mountApp(
  container: HTMLElement,
  app: ReactNode,
  pathname: string,
  options?: Pick<RootOptions, 'onRecoverableError'>,
): Root {
  if (hydratesPrerender(container, pathname)) {
    return hydrateRoot(container, app, options);
  }
  const root = createRoot(container, options);
  root.render(app);
  return root;
}
