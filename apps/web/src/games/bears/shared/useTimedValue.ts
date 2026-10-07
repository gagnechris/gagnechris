import { useCallback, useEffect, useRef, useState } from 'react';

export type TimedValue<T> = { value: T; id: number };

/**
 * A value that clears itself after `durationMs`. Every `show` gets a new id,
 * so a repeat restarts both the timer and any keyed animation.
 */
export function useTimedValue<T>(
  durationMs: number | ((value: T) => number),
): [TimedValue<T> | null, (value: T) => void, () => void] {
  const [current, setCurrent] = useState<TimedValue<T> | null>(null);
  const seq = useRef(0);
  const duration = useRef(durationMs);

  useEffect(() => {
    duration.current = durationMs;
  }, [durationMs]);

  const show = useCallback((value: T) => {
    seq.current += 1;
    setCurrent({ value, id: seq.current });
  }, []);
  const clear = useCallback(() => setCurrent(null), []);

  useEffect(() => {
    if (!current) return;
    const d = duration.current;
    const ms = typeof d === 'function' ? d(current.value) : d;
    const id = window.setTimeout(() => setCurrent(null), ms);
    return () => window.clearTimeout(id);
  }, [current]);

  return [current, show, clear];
}
