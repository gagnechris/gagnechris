import { lazy, type ComponentProps } from 'react';
import type MarkdownPreview from './MarkdownPreview';
import {
  loadMarkdownPreview,
  loadedMarkdownPreview,
} from './markdownPreviewModule';

const Lazy = lazy(() =>
  loadMarkdownPreview().then((component) => ({ default: component })),
);

/** Renders without suspending once `loadMarkdownPreview` has resolved. */
export function LazyMarkdownPreview(
  props: ComponentProps<typeof MarkdownPreview>,
) {
  const Loaded = loadedMarkdownPreview();
  // eslint-disable-next-line react-hooks/static-components -- one module-level component, not a new one per render
  return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
}
