import type { ReactNode } from 'react';
import {
  createRoot,
  hydrateRoot,
  type Root,
  type RootOptions,
} from 'react-dom/client';

const PRERENDER_START = 'prerender:start';

// A post or project prerender is reused only on its own slug's path: the
// app would render another page and the hydration would mismatch.
const SLUGGED_PRERENDER =
  ':scope > main.project-page[data-slug], :scope > main.post-page > article[data-slug]';
const pathSlug = (pathname: string) =>
  /^\/(?:posts|projects)\/([^/]+)\/?$/.exec(pathname)?.[1];

export const hydratesPrerender = (
  container: Element,
  pathname: string,
): boolean => {
  const first = container.firstChild;
  if (
    first?.nodeType !== Node.COMMENT_NODE ||
    (first as Comment).data !== PRERENDER_START
  ) {
    return false;
  }
  const slugged = container.querySelector(SLUGGED_PRERENDER);
  return !slugged || slugged.getAttribute('data-slug') === pathSlug(pathname);
};

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
