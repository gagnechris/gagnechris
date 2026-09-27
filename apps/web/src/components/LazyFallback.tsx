/** Shown while lazy admin/auth chunks load (avoids RR HydrateFallback warning). */
export const LazyFallback = () => (
  <p className="admin-loading" role="status">
    Loading…
  </p>
)
