export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';

/** Matches web local auth (`VITE_AUTH_MODE=local`). */
export const localDevToken = 'local-dev-token';

/** The `sub` the local API gives `local-dev-token`; keys the cache until sign-in. */
export const localDevSub = 'local-dev-user';
