import { lazy } from 'react';

/** Keeps marked and the sanitizer out of the editor chunk until Preview opens. */
export const LazyMarkdownPreview = lazy(() => import('./MarkdownPreview'));
