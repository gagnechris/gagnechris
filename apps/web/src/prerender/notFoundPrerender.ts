import { fromPrerender } from './documentPrerender';

// Read on import, like the `#root` snapshot: the path the 404 page was served for.
const coldLoadPath: string | null =
  typeof window === 'undefined' ? null : window.location.pathname;

const isNotFoundDocument = (root: ParentNode): true | null =>
  root.querySelector('main.not-found') ? true : null;

/**
 * CloudFront serves 404.html for unknown paths, so a cold load of
 * `/posts/missing` already shows the 404 and must not flash "Loading post".
 */
export const coldLoadedNotFound = (pathname: string): boolean =>
  pathname === coldLoadPath && fromPrerender(isNotFoundDocument) === true;
