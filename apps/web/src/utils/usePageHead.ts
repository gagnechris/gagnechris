import { useLayoutEffect } from 'react';

export type PageHead = {
  title: string;
  /** Null for pages that must not be indexed. */
  url: string | null;
  description?: string;
  image?: string;
};

const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
  let meta = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.append(meta);
  }
  if (meta.getAttribute('content') !== content) {
    meta.setAttribute('content', content);
  }
};

const removeHead = (selector: string) =>
  document.head.querySelectorAll(selector).forEach((el) => el.remove());

/**
 * Edits the prerendered head in place rather than rendering `<title>` and
 * `<link>` elements: React 19 hoists those as extra tags, and its `<title>`
 * goes first, replacing the publisher's SEO title.
 */
export function usePageHead({ title, url, description, image }: PageHead) {
  useLayoutEffect(() => {
    if (document.title !== title) document.title = title;
    setMeta('property', 'og:title', title);
    setMeta('name', 'twitter:title', title);
    if (description !== undefined) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    if (image !== undefined) {
      setMeta('property', 'og:image', image);
      setMeta('name', 'twitter:image', image);
    }

    if (url === null) {
      removeHead('link[rel="canonical"], meta[property="og:url"]');
      setMeta('name', 'robots', 'noindex');
      return () => removeHead('meta[name="robots"]');
    }
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.append(canonical);
    }
    if (canonical.getAttribute('href') !== url) {
      canonical.setAttribute('href', url);
    }
    setMeta('property', 'og:url', url);
  }, [title, url, description, image]);
}
