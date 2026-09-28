/**
 * Vite `/api` proxy target for local admin.
 * Default is local (safe). Opt into production with `VITE_API_TARGET=prod`.
 */
export function isDevProdApiTarget(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_API_TARGET === 'prod';
}
