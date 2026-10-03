import { createApiClient } from '@gagnechris/api-client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { searchNotebook } from '../src/query/api.js';

describe('notebook search request (CHR-196)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('sends q in a POST body, never in the URL', async () => {
    const captured: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: Request) => {
      const text = await input.text();
      captured.push({
        method: input.method,
        url: input.url,
        body: text ? JSON.parse(text) : undefined,
      });
      return new Response(JSON.stringify({ notes: [], tasks: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = createApiClient({ baseUrl: 'http://api.test' });

    const result = await searchNotebook(client, {
      q: 'secret plans',
      area: 'work',
      limit: 10,
    });

    expect(result).toEqual({ notes: [], tasks: [] });
    expect(captured).toEqual([
      {
        method: 'POST',
        url: 'http://api.test/api/notebook/search',
        body: { q: 'secret plans', area: 'work', limit: 10 },
      },
    ]);
  });
});
