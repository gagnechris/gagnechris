import { useCallback, useState } from 'react';

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function read(key: string, min: number, max: number): number | null {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? clamp(n, min, max) : null;
  } catch {
    return null;
  }
}

/** A width in px remembered per browser; null means the CSS default. */
export function useStoredWidth(key: string, min: number, max: number) {
  const [width, setWidthState] = useState(() => read(key, min, max));
  const setWidth = useCallback(
    (next: number | null, live = false) => {
      const value = next === null ? null : Math.round(clamp(next, min, max));
      setWidthState(value);
      if (live) return;
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(value));
      } catch {
        // private mode / blocked storage
      }
    },
    [key, min, max],
  );
  return [width, setWidth] as const;
}
