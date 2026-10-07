import { useMediaQuery } from '../../../kit/useMediaQuery';

export { useMediaQuery };

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';
// Matches the CSS that covers the Stay Wild stage with the rotate notice.
export const TOUCH_PORTRAIT_QUERY =
  '(pointer: coarse) and (orientation: portrait)';

export const usePrefersReducedMotion = () =>
  useMediaQuery(REDUCED_MOTION_QUERY);

export const useCoarsePointer = () => useMediaQuery(COARSE_POINTER_QUERY);
