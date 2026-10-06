import { useEffect, useRef } from 'react';

/** A ref that holds the last committed `value`, for callbacks that must not change identity. */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
