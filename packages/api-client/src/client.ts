import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type TokenProviderOptions = {
  /** When true, the provider should refresh (e.g. Amplify forceRefresh). */
  forceRefresh?: boolean;
};

/**
 * Returns a bearer token for authenticated requests, or null/undefined to skip.
 * Callers may pass `{ forceRefresh: true }` after a 401 (CHR-177).
 */
export type TokenProvider = (
  options?: TokenProviderOptions,
) => Promise<string | null | undefined>;

export type CreateApiClientOptions = {
  baseUrl: string;
  /** When omitted, no Authorization header is set (public routes). */
  getToken?: TokenProvider;
  /**
   * When true (default if `getToken` is set), a single 401 response triggers
   * `getToken({ forceRefresh: true })` and one retry of the same request.
   */
  retryOnUnauthorized?: boolean;
};

/** Marks a request that already consumed the single 401 retry. */
const RETRIED_HEADER = 'x-gagnechris-auth-retried';

/**
 * Typed OpenAPI client for `/api/*`.
 * Web passes an Amplify-based `getToken`; React Native will pass Amplify-RN /
 * SecureStore; public callers omit `getToken`.
 */
export const createApiClient = ({
  baseUrl,
  getToken,
  retryOnUnauthorized = true,
}: CreateApiClientOptions) => {
  const client = createClient<paths>({ baseUrl });
  if (!getToken) {
    return client;
  }

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const token = await getToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
    async onResponse({ request, response, options }) {
      if (
        !retryOnUnauthorized ||
        response.status !== 401 ||
        request.headers.get(RETRIED_HEADER) === '1'
      ) {
        return undefined;
      }
      const token = await getToken({ forceRefresh: true });
      const headers = new Headers(request.headers);
      headers.set(RETRIED_HEADER, '1');
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      } else {
        headers.delete('Authorization');
      }
      // options.fetch is the raw fetch — set the refreshed token explicitly.
      return options.fetch(new Request(request, { headers }));
    },
  };
  client.use(authMiddleware);
  return client;
};

export type ApiClient = ReturnType<typeof createApiClient>;
