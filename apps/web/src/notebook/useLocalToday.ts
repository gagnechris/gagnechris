import { useEffect, useRef, useState } from 'react';
import { localToday } from '../kit/calendarDates';

/**
 * Rolls over at midnight and when the tab comes back, so pages left open
 * overnight do not keep yesterday as "today". `onRollover` runs in the same
 * batch as the change, so a caller can pin the previous day without a render
 * in between.
 */
export function useLocalToday(
  onRollover?: (previous: string, next: string) => void,
): string {
  const [today, setToday] = useState(localToday);
  const onRolloverRef = useRef(onRollover);
  useEffect(() => {
    onRolloverRef.current = onRollover;
  }, [onRollover]);

  useEffect(() => {
    const refresh = () => {
      const next = localToday();
      if (next === today) return;
      onRolloverRef.current?.(today, next);
      setToday(next);
    };
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const handle = window.setTimeout(
      refresh,
      nextMidnight.getTime() - now.getTime() + 1_000,
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(handle);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [today]);

  return today;
}
