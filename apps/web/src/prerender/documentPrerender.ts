/**
 * `createRoot` throws away the prerendered `#root`, so it is copied when this
 * module is first imported (before `main.tsx` mounts). Pages seed their first
 * render from it instead of bundled defaults or a loading state, so a cold
 * load paints the same text twice.
 */
const snapshot: Element | null =
  typeof document === 'undefined'
    ? null
    : ((document.getElementById('root')?.cloneNode(true) as
        Element | undefined) ?? null);

const parsed = new WeakMap<object, unknown>();

/** Parses the cold-load prerender once per parser; null when absent or unparseable. */
export function fromPrerender<T>(
  parse: (root: ParentNode) => T | null,
): T | null {
  if (!snapshot) return null;
  if (!parsed.has(parse)) parsed.set(parse, parse(snapshot));
  return parsed.get(parse) as T | null;
}

/** For views that also load later from fetched HTML. */
export async function fetchPrerender<T>(
  url: string,
  parse: (root: ParentNode) => T | null,
): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!response.ok) return null;
  const html = await response.text();
  return parse(new DOMParser().parseFromString(html, 'text/html'));
}
