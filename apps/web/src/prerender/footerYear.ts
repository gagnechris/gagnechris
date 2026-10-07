import { useSyncExternalStore } from 'react';
import { fromPrerender } from './documentPrerender';

const publishedFooterYear = (root: ParentNode): number | null => {
  const year = root
    .querySelector('.site-footer__copy')
    ?.textContent?.match(/\d{4}/)?.[0];
  return year ? Number(year) : null;
};

const subscribe = () => () => {};
const liveYear = () => new Date().getFullYear();

/**
 * The live year, but hydration first renders the year the page was published
 * with (React's server snapshot), so a page published last year still matches.
 */
export const useFooterYear = (): number =>
  useSyncExternalStore(
    subscribe,
    liveYear,
    () => fromPrerender(publishedFooterYear) ?? liveYear(),
  );
