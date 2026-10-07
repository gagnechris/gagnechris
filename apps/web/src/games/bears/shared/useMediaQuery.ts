import { useMediaQuery } from '../../../kit/useMediaQuery';

export { useMediaQuery };

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';
// `breakpoint.phone`, where the Bears pages switch to their phone layouts.
export const BEARS_PHONE_QUERY = '(max-width: 480px)';
// Matches the CSS that covers the Stay Wild stage with the rotate notice.
export const TOUCH_PORTRAIT_QUERY =
  '(pointer: coarse) and (orientation: portrait)';

export const usePrefersReducedMotion = () =>
  useMediaQuery(REDUCED_MOTION_QUERY);

export const useCoarsePointer = () => useMediaQuery(COARSE_POINTER_QUERY);

export const useBearsPhone = () => useMediaQuery(BEARS_PHONE_QUERY);
