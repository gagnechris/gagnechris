/** Static HydrateFallback for lazy routes (must sit on the route config, not inside lazy()). */
export const LazyFallback = () => (
  <p className="admin-loading" role="status">
    Loading…
  </p>
)
