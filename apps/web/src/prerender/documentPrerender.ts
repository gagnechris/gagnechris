/**
 * `createRoot` throws away the prerendered `#root`, so it is copied when this
 * module is first imported (before `main.tsx` mounts). Pages seed their first
 * render from it instead of bundled defaults or a loading state, so a cold
 * load paints the same text twice. The head title and metas go with it, so a
 * parser sees the same document shape here as in fetched HTML.
 */
const snapshot: Document | null = (() => {
  const root =
    typeof document === 'undefined' ? null : document.getElementById('root');
  if (!root) return null;
  const copy = document.implementation.createHTMLDocument(document.title);
  for (const meta of document.head.querySelectorAll('meta')) {
    copy.head.append(copy.importNode(meta, true));
  }
  copy.body.append(copy.importNode(root, true));
  return copy;
})();

/** The publisher's `<title>`, which carries a page's SEO title when one is set. */
const prerenderedTitle = (root: ParentNode): string | null =>
  root.querySelector('head > title')?.textContent?.trim() || null;

export type PrerenderedHead = {
  title: string;
  description?: string | undefined;
  image?: string | undefined;
};

const headMeta = (root: ParentNode, selector: string): string | undefined =>
  root
    .querySelector(`head > meta[${selector}]`)
    ?.getAttribute('content')
    ?.trim() || undefined;

/** What the publisher wrote into the head, so client navigation carries it too. */
export const prerenderedHead = (
  root: ParentNode,
  fallbackTitle: string,
): PrerenderedHead => ({
  title: prerenderedTitle(root) ?? fallbackTitle,
  description: headMeta(root, 'name="description"'),
  image: headMeta(root, 'property="og:image"'),
});

const parsed = new WeakMap<object, unknown>();

/** Parses the cold-load prerender once per parser; null when absent or unparseable. */
export function fromPrerender<T>(
  parse: (root: ParentNode) => T | null,
): T | null {
  if (!snapshot) return null;
  if (!parsed.has(parse)) parsed.set(parse, parse(snapshot));
  return parsed.get(parse) as T | null;
}

/**
 * For views that also load later from fetched HTML. Null only for a 404 or a
 * page that isn't this view; any other failure rejects.
 */
export async function fetchPrerender<T>(
  url: string,
  parse: (root: ParentNode) => T | null,
): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const html = await response.text();
  return parse(new DOMParser().parseFromString(html, 'text/html'));
}
