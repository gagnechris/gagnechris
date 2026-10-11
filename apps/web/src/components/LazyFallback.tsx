/** Static HydrateFallback for lazy routes (must sit on the route config, not inside lazy()). */
export const LazyFallback = () => (
  <p className="route-loading" role="status">
    Loading…
  </p>
);

export const EmptyFallback = () => null;
