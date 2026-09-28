import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

describe('createApiClient', () => {
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
});
