import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

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
    // Provider is only invoked on requests; constructing the client must not call it.
    expect(getToken).not.toHaveBeenCalled();
  });

  it('retries once on 401 with getToken({ forceRefresh: true }) (CHR-177)', async () => {
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
});
