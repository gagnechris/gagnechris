import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

const authOf = (input: unknown) =>
  (input as Request).headers.get('Authorization');

// Answers 200 only to the fresh token, after `delayFor(call)` ms.
const fakeApi = (delayFor: (call: number) => number = () => 0) => {
  let calls = 0;
  return vi.fn(async (input: unknown) => {
    const call = calls++;
    await new Promise((resolve) => setTimeout(resolve, delayFor(call)));
    return authOf(input) === 'Bearer fresh-token'
      ? new Response('{}', { status: 200 })
      : new Response('{}', { status: 401 });
  });
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const collectGarbage = async () => {
  const { gc } = globalThis as { gc?: () => void };
  if (!gc) throw new Error('run with --expose-gc (vitest.config.ts)');
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
  }
};

describe('createApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a client without auth middleware when getToken is omitted', () => {
    const client = createApiClient({ baseUrl: 'https://example.com' });
    expect(client.GET).toBeTypeOf('function');
    expect(client.POST).toBeTypeOf('function');
  });

  it('accepts a TokenProvider without importing auth/session', async () => {
    const getToken = vi.fn(async () => 'test-token');
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });
    expect(client.GET).toBeTypeOf('function');
    expect(getToken).not.toHaveBeenCalled();
  });

  it('retries once on 401 with getToken({ forceRefresh: true })', async () => {
    const getToken = vi
      .fn()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'ok', service: 'gagnechris-api' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const { data, response } = await client.GET('/api/health');
    expect(response.status).toBe(200);
    expect(data).toEqual({ status: 'ok', service: 'gagnechris-api' });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken.mock.calls[0]).toEqual([]);
    expect(getToken.mock.calls[1]).toEqual([{ forceRefresh: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0].headers.get('Authorization')).toBe(
      'Bearer stale-token',
    );
    expect(fetchMock.mock.calls[1][0].headers.get('Authorization')).toBe(
      'Bearer fresh-token',
    );
  });

  it('does not retry a second 401', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? 'fresh-token' : 'stale-token',
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('no', {
          status: 401,
          headers: { 'content-type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('still no', {
          status: 401,
          headers: { 'content-type': 'text/plain' },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const { response } = await client.GET('/api/health');
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('retries once on 403 so a refreshed token can carry new groups', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? 'fresh-token' : 'stale-token',
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const { response } = await client.GET('/api/health');
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0].headers.get('Authorization')).toBe(
      'Bearer fresh-token',
    );
  });

  it('shares one refresh across concurrent 401s', async () => {
    const refresh = deferred<string>();
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? refresh.promise : 'stale-token',
    );
    const fetchMock = fakeApi();
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const calls = Promise.all(
      Array.from({ length: 5 }, () => client.GET('/api/health')),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await new Promise((resolve) => setTimeout(resolve, 10));
    refresh.resolve('fresh-token');
    const results = await calls;

    expect(results.map((r) => r.response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(
      getToken.mock.calls.filter(([opts]) => opts?.forceRefresh),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(fetchMock.mock.calls.slice(5).map(([req]) => authOf(req))).toEqual(
      Array(5).fill('Bearer fresh-token'),
    );
  });

  it('reuses a finished refresh for 401s from requests sent before it', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? 'fresh-token' : 'stale-token',
    );
    const fetchMock = fakeApi((call) => (call < 5 ? call * 20 : 0));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.GET('/api/health')),
    );

    expect(results.every((r) => r.response.status === 200)).toBe(true);
    expect(
      getToken.mock.calls.filter(([opts]) => opts?.forceRefresh),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('refreshes again for a 401 on a request sent after the last refresh', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? 'fresh-token' : 'stale-token',
    );
    vi.stubGlobal('fetch', fakeApi());
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    await client.GET('/api/health');
    await client.GET('/api/health');

    expect(
      getToken.mock.calls.filter(([opts]) => opts?.forceRefresh),
    ).toHaveLength(2);
  });

  it('returns the original 401 when the refresh throws', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) => {
      if (opts?.forceRefresh) throw new Error('refresh token revoked');
      return 'stale-token';
    });
    const fetchMock = fakeApi();
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const { response } = await client.GET('/api/health');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the original 401 when the refresh yields no token', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? null : 'stale-token',
    );
    const fetchMock = fakeApi();
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    const { response } = await client.GET('/api/health');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the retry with only the original headers and the new token', async () => {
    const getToken = vi.fn(async (opts?: { forceRefresh?: boolean }) =>
      opts?.forceRefresh ? 'fresh-token' : 'stale-token',
    );
    const fetchMock = fakeApi();
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient({
      baseUrl: 'https://example.com',
      getToken,
    });

    await client.GET('/api/health');

    const [first, retry] = fetchMock.mock.calls.map(
      ([req]) => new Map((req as Request).headers),
    );
    first.set('authorization', 'Bearer fresh-token');
    expect(retry).toEqual(first);
  });

  it('keeps no per-request state once a fetch throws', async () => {
    const clones: WeakRef<Request>[] = [];
    const clone = Request.prototype.clone;
    Request.prototype.clone = function (this: Request) {
      const copy = clone.call(this);
      clones.push(new WeakRef(copy));
      return copy;
    };
    try {
      vi.stubGlobal('fetch', async () => {
        throw new TypeError('network down');
      });
      const client = createApiClient({
        baseUrl: 'https://example.com',
        getToken: async () => 'token',
      });
      for (let i = 0; i < 3; i += 1) {
        await expect(client.GET('/api/health')).rejects.toThrow('network down');
      }
    } finally {
      Request.prototype.clone = clone;
    }

    await collectGarbage();

    expect(clones.length).toBeGreaterThan(0);
    expect(clones.filter((ref) => ref.deref())).toEqual([]);
  });
});
