import { useEffect, useState } from 'react';
import { localToday } from './calendarDates';

/**
 * Rolls over at midnight and when the tab comes back, so pages left open
 * overnight do not keep yesterday as "today".
 */
export function useLocalToday(): string {
  const [today, setToday] = useState(localToday);

  useEffect(() => {
    const refresh = () => setToday(localToday());
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
