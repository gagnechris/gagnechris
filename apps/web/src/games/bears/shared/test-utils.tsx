import { act, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, onTestFinished, vi } from 'vitest';

/**
 * Fake timers, rAF and performance for a game test file, with storage and
 * spies reset between tests. `now` also fakes Date at that time.
 */
export function setupGameTests({ now }: { now?: Date } = {}) {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        ...(now ? (['Date'] as const) : []),
      ],
    });
    if (now) vi.setSystemTime(now);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}

export const renderInRouter = (ui: ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

export const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

export const pressKey = (key: string, type: 'keyDown' | 'keyUp' = 'keyDown') =>
  act(() => {
    fireEvent[type](window, { key });
  });

/**
 * Answers matchMedia with `matches(query)`, read on every access, and returns
 * `change()` to notify listeners after the answer changes.
 */
export function stubMedia(matches: (query: string) => boolean) {
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return matches(query);
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) =>
          listeners.delete(cb),
      }) as unknown as MediaQueryList,
  );
  return {
    change: () =>
      act(() => {
        listeners.forEach((cb) => cb());
      }),
  };
}

/** Defines `navigator[key]` for the current test only. */
function stubNavigator(
  key: 'clipboard' | 'share' | 'canShare',
  value: unknown,
) {
  const original = Object.getOwnPropertyDescriptor(navigator, key);
  Object.defineProperty(navigator, key, { value, configurable: true });
  onTestFinished(() => {
    if (original) Object.defineProperty(navigator, key, original);
    else Reflect.deleteProperty(navigator, key);
  });
}

export function stubClipboard(
  writeText: (text: string) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  stubNavigator('clipboard', { writeText });
  return writeText;
}

export function stubShare(share: (data: ShareData) => Promise<void>) {
  stubNavigator('share', share);
  stubNavigator('canShare', () => true);
  return share;
}
