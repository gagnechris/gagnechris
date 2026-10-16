import { useEffect, useRef, useState } from 'react';
import { localDateString } from '@gagnechris/shared';

type LocalTodayOptions = {
  /**
   * Runs in the same batch as the change, so a caller can pin the previous
   * day without a render in between. `returned` is false for the midnight timer.
   */
  onRollover?: (previous: string, next: string, returned: boolean) => void;
  /** Runs each time the tab is shown again or the window regains focus. */
  onReturn?: () => void;
};

/**
 * Rolls over at midnight and when the tab comes back: timers stall while a
 * laptop sleeps or a tab is in the background.
 */
export function useLocalToday({
  onRollover,
  onReturn,
}: LocalTodayOptions = {}): string {
  const [today, setToday] = useState(() => localDateString());
  // Focus and visibilitychange can both fire before React re-subscribes.
  const todayRef = useRef(today);
  const callbacksRef = useRef({ onRollover, onReturn });
  useEffect(() => {
    callbacksRef.current = { onRollover, onReturn };
  }, [onRollover, onReturn]);

  useEffect(() => {
    const refresh = (returned: boolean) => {
      const previous = todayRef.current;
      const next = localDateString();
      if (next !== previous) {
        todayRef.current = next;
        callbacksRef.current.onRollover?.(previous, next, returned);
        setToday(next);
      }
      if (returned) callbacksRef.current.onReturn?.();
    };
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const handle = window.setTimeout(
      () => refresh(false),
      nextMidnight.getTime() - now.getTime() + 1_000,
    );
    const onFocus = () => refresh(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(handle);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [today]);

  return today;
}
