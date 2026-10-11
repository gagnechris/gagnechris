import { createApiClient } from '@gagnechris/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppApiProvider } from '../src/AppApiProvider.js';
import {
  SEARCH_DEBOUNCE_MS,
  useDebouncedNotebookSearch,
} from '../src/query/search.js';
import { act, renderHook } from './renderHook.js';

const noteHit = (q: string) => ({
  type: 'note',
  id: `N-${q}`,
  area: 'work',
  title: q,
  snippet: '',
  matches: [],
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50),
    );
  });

describe('useDebouncedNotebookSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('sends one request once typing pauses and keeps the last results meanwhile', async () => {
    const sent: string[] = [];
    let release: (() => void) | undefined;
    vi.stubGlobal('fetch', async (input: Request) => {
      const { q } = (await input.json()) as { q: string };
      sent.push(q);
      if (q === 'meetings') {
        await new Promise<void>((resolve) => (release = resolve));
      }
      return new Response(JSON.stringify({ notes: [noteHit(q)], tasks: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = createApiClient({ baseUrl: 'http://api.test' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AppApiProvider, {
        getClient: () => client,
        children: createElement(QueryClientProvider, {
          client: queryClient,
          children,
        }),
      });

    let q = '';
    const { result, rerender, unmount } = renderHook(
      () => useDebouncedNotebookSearch(q, { area: 'work', limit: 50 }),
      { wrapper },
    );
    for (const letter of 'meeting') {
      q += letter;
      rerender();
    }
    expect(result.current.pending).toBe(true);
    await settle();
    await settle();

    expect(sent).toEqual(['meeting']);
    expect(result.current.pending).toBe(false);
    expect(result.current.notes.map((n) => n.title)).toEqual(['meeting']);

    q = 'meetings';
    rerender();
    await settle();
    expect(sent).toEqual(['meeting', 'meetings']);
    expect(result.current.pending).toBe(true);
    expect(result.current.notes.map((n) => n.title)).toEqual(['meeting']);

    release?.();
    await settle();
    expect(result.current.notes.map((n) => n.title)).toEqual(['meetings']);

    q = '';
    rerender();
    expect(result.current.notes).toEqual([]);
    expect(result.current.pending).toBe(false);
    unmount();
  });
});
