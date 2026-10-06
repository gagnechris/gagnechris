import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { coldLoadedNotFound } from './notFoundPrerender';

export type PublishedView<T> =
  | { status: 'loading' }
  | { status: 'ready'; view: T }
  | { status: 'missing' }
  | { status: 'error' };

const LOADING = { status: 'loading' } as const;
const MISSING = { status: 'missing' } as const;
const ERROR = { status: 'error' } as const;

type Settled<T> = { key: string; result: PublishedView<T> };

/**
 * Seeds from the cold-load prerender, else fetches. `load` resolves null when
 * the page doesn't exist and rejects when it couldn't be fetched, so a network
 * failure never reads as "Page not found".
 */
export function usePublishedView<T>(
  key: string,
  fromDocument: (key: string) => T | null,
  load: (key: string) => Promise<T | null>,
): PublishedView<T> {
  const { pathname } = useLocation();
  const [settled, setSettled] = useState<Settled<T> | null>(() => {
    if (coldLoadedNotFound(pathname)) return { key, result: MISSING };
    const view = fromDocument(key);
    return view === null ? null : { key, result: { status: 'ready', view } };
  });
  const settledKey = settled?.key;

  useEffect(() => {
    if (settledKey === key) return;
    let cancelled = false;
    load(key).then(
      (view) => {
        if (cancelled) return;
        setSettled({
          key,
          result: view === null ? MISSING : { status: 'ready', view },
        });
      },
      (err: unknown) => {
        console.error(`Error loading ${key}:`, err);
        if (!cancelled) setSettled({ key, result: ERROR });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, settledKey, load]);

  return settled?.key === key ? settled.result : LOADING;
}
