import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type TokenProviderOptions = {
  forceRefresh?: boolean;
};

export type TokenProvider = (
  options?: TokenProviderOptions,
) => Promise<string | null | undefined>;

export type CreateApiClientOptions = {
  baseUrl: string;
  getToken?: TokenProvider;
  /**
   * Retries 403 too: a token minted before the user joined a group
   * lacks the new `cognito:groups` until refreshed.
   */
  retryOnUnauthorized?: boolean;
  /**
   * Registered ahead of auth, so one can answer a request (from a local
   * store) before a token is fetched or refreshed.
   */
  before?: Middleware[];
};

export type ApiMiddleware = Middleware;

type Sent = { retry: globalThis.Request; refreshesBefore: number };

export const createApiClient = ({
  baseUrl,
  getToken,
  retryOnUnauthorized = true,
  before = [],
}: CreateApiClientOptions) => {
  const client = createClient<paths>({ baseUrl });
  if (before.length > 0) client.use(...before);
  if (!getToken) {
    return client;
  }

  // Keyed by the request object so an entry dies with its request, even when fetch throws.
  const sent = new WeakMap<globalThis.Request, Sent>();
  let refreshes = 0;
  let latestRefresh: Promise<string | null | undefined> | undefined;

  // A request sent before the latest refresh started reuses it instead of refreshing again.
  const refreshedToken = (refreshesBefore: number) => {
    if (!latestRefresh || refreshesBefore === refreshes) {
      latestRefresh = getToken({ forceRefresh: true });
      refreshes += 1;
    }
    return latestRefresh;
  };

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      if (retryOnUnauthorized) {
        // Cloned before the body is consumed so POST bodies survive a retry.
        sent.set(request, {
          retry: request.clone(),
          refreshesBefore: refreshes,
        });
      }
      const token = await getToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
    async onResponse({ request, response, options }) {
      const entry = sent.get(request);
      sent.delete(request);
      if (!entry || (response.status !== 401 && response.status !== 403)) {
        return undefined;
      }
      let token: string | null | undefined;
      try {
        token = await refreshedToken(entry.refreshesBefore);
      } catch {
        return undefined;
      }
      if (!token) {
        return undefined;
      }
      const headers = new globalThis.Headers(entry.retry.headers);
      headers.set('Authorization', `Bearer ${token}`);
      // options.fetch bypasses middleware, so the retry is never retried again.
      return options.fetch(new globalThis.Request(entry.retry, { headers }));
    },
  };
  client.use(authMiddleware);
  return client;
};

export type ApiClient = ReturnType<typeof createApiClient>;
