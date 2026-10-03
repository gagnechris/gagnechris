import type { RetrySignals } from '@gagnechris/app-core';

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
