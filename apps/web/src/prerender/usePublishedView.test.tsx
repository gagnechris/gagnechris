import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePublishedView } from './usePublishedView';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const none = () => null;

describe('usePublishedView', () => {
  afterEach(() => vi.restoreAllMocks());

  test('a view in the document is ready without a fetch', () => {
    const load = vi.fn();
    const { result } = renderHook(
      () => usePublishedView('a', (key) => `doc ${key}`, load),
      { wrapper },
    );
    expect(result.current).toEqual({ status: 'ready', view: 'doc a' });
    expect(load).not.toHaveBeenCalled();
  });

  test('loads, then is ready', async () => {
    const { result } = renderHook(
      () => usePublishedView('a', none, async (key) => `fetched ${key}`),
      { wrapper },
    );
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', view: 'fetched a' }),
    );
  });

  test('null from load is missing', async () => {
    const { result } = renderHook(
      () => usePublishedView('a', none, async () => null),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'missing' }));
  });

  test('a rejected load is an error, not missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(
      () =>
        usePublishedView('a', none, () =>
          Promise.reject(new TypeError('Failed to fetch')),
        ),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
  });

  test('a new key loads again and ignores the stale answer', async () => {
    let resolveA: (value: string) => void = () => {};
    const load = vi.fn((key: string) =>
      key === 'a'
        ? new Promise<string>((resolve) => (resolveA = resolve))
        : Promise.resolve(`fetched ${key}`),
    );
    const { result, rerender } = renderHook(
      ({ key }) => usePublishedView(key, none, load),
      { wrapper, initialProps: { key: 'a' } },
    );
    rerender({ key: 'b' });
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', view: 'fetched b' }),
    );
    resolveA('fetched a');
    await Promise.resolve();
    expect(result.current).toEqual({ status: 'ready', view: 'fetched b' });
  });
});
