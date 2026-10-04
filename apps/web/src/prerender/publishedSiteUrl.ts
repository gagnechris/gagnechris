/**
 * Only the Vite dev server proxies `/__site` to the local static origin. A
 * build, local or prod, is served by that origin, so it fetches same-origin
 * paths even when the local env file set VITE_LOCAL_SITE_ORIGIN.
 */
export const publishedSiteUrl = (path: string): string =>
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim()
    ? `/__site${path}`
    : path;
