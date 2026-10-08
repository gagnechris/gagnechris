import { localDateString } from '@gagnechris/shared';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** The device's day; rolls over at midnight and when the app comes back. */
export function useLocalToday(): string {
  const [today, setToday] = useState(() => localDateString());
  useEffect(() => {
    const refresh = () => setToday(localDateString());
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timer = setTimeout(
      refresh,
      nextMidnight.getTime() - now.getTime() + 1_000,
    );
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);
  return today;
}
