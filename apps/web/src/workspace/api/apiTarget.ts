/** Defaults to local so dev only reaches production with `VITE_API_TARGET=prod`. */
export function isDevProdApiTarget(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_API_TARGET === 'prod';
}
