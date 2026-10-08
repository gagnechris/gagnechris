import type MarkdownPreview from './MarkdownPreview';

let loaded: typeof MarkdownPreview | undefined;
let loading: Promise<typeof MarkdownPreview> | undefined;

export const loadedMarkdownPreview = () => loaded;

/** Keeps marked and the sanitizer out of the editor chunk until Preview opens. */
export function loadMarkdownPreview() {
  loading ??= import('./MarkdownPreview').then((m) => (loaded = m.default));
  return loading;
}
