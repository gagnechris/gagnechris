import type { RetrySignals } from '@gagnechris/app-core';

/**
 * Retry a failed autosave as soon as the browser says the network may be
 * back: `online`, window focus, or the tab becoming visible (CHR-189).
 */
export const browserRetrySignals: RetrySignals = (retry) => {
  const onVisible = () => {
    if (document.visibilityState === 'visible') retry();
  };
  window.addEventListener('online', retry);
  window.addEventListener('focus', retry);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', retry);
    window.removeEventListener('focus', retry);
    document.removeEventListener('visibilitychange', onVisible);
  };
};
