import { expect } from 'vitest';
import type { Claims, RequestOptions } from './api.js';
import { notebookUser } from './claims.js';
import type { Harness } from './harness.js';

// Bodies are whatever JSON the server sent; suites assert on their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export type CallOptions = {
  body?: unknown;
  query?: RequestOptions['query'];
  headers?: Record<string, string>;
  ifMatch?: string;
  /** Call as this Notebook user. */
  user?: string;
  /** Call with these claims; wins over `user`. */
  claims?: Claims;
};

export type CallResponse = {
  status: number;
  etag?: string;
  /** The JSON body, `{}` when the response has none. */
  body: Json;
  /** Not enumerable, so `toEqual({ status, etag, body })` still holds. */
  readonly headers: Headers;
};

export type CallDefaults = {
  /** A Notebook user for calls that name no user or claims. */
  user?: string;
  /** Claims for calls that name no user or claims; a function gets the path. */
  claims?: Claims | ((path: string) => Claims);
  /** Prepended to every path. */
  prefix?: string;
};

/** `call` answers whatever the API sends; `ok` expects a 2xx and returns its body. */
export function apiCalls(h: Harness, defaults: CallDefaults = {}) {
  const claimsFor = (path: string, opts: CallOptions) => {
    if (opts.claims) return opts.claims;
    if (opts.user !== undefined) return notebookUser(opts.user);
    if (typeof defaults.claims === 'function') return defaults.claims(path);
    if (defaults.claims) return defaults.claims;
    return defaults.user === undefined
      ? undefined
      : notebookUser(defaults.user);
  };

  const call = async (
    method: string,
    path: string,
    opts: CallOptions = {},
  ): Promise<CallResponse> => {
    const target = `${defaults.prefix ?? ''}${path}`;
    const res = await h.api.request(method, target, {
      body: opts.body,
      query: opts.query,
      headers: {
        ...opts.headers,
        ...(opts.ifMatch === undefined ? {} : { 'if-match': opts.ifMatch }),
      },
      claims: claimsFor(target, opts),
    });
    const etag = res.headers.get('etag') ?? undefined;
    const out = { status: res.status, etag, body: res.body ?? {} };
    Object.defineProperty(out, 'headers', { value: res.headers });
    return out as CallResponse;
  };

  const ok = async <T = Json>(
    method: string,
    path: string,
    opts?: CallOptions,
  ): Promise<T> => {
    const res = await call(method, path, opts);
    expect(
      res.status >= 200 && res.status < 300,
      `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
    ).toBe(true);
    return res.body as T;
  };

  return { call, ok };
}
