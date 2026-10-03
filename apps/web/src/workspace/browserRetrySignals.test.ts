import { describe, expect, test, vi } from 'vitest';
import { browserRetrySignals } from './browserRetrySignals';

describe('browserRetrySignals', () => {
  test('retries on online, focus and the tab becoming visible, until unsubscribed', () => {
    const retry = vi.fn();
    const unsubscribe = browserRetrySignals(retry);

    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    expect(retry).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(retry).toHaveBeenCalledTimes(3);

    unsubscribe();
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    expect(retry).toHaveBeenCalledTimes(3);
  });
});
