import { lazy } from 'react';

/** Keeps marked and the sanitizer out of the editor chunk until Preview opens. */
export const LazyBodyPreview = lazy(() =>
  import('./BodyPreview').then((m) => ({ default: m.BodyPreview })),
);
