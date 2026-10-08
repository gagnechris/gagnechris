import {
  DEFAULT_NOTEBOOK_AREA_FILTER,
  isNotebookAreaFilter,
  NOTEBOOK_AREA_STORAGE_KEY,
  type NotebookAreaFilter,
} from '@gagnechris/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export async function readStoredArea(
  store: KeyValueStore,
): Promise<NotebookAreaFilter> {
  try {
    const raw = await store.getItem(NOTEBOOK_AREA_STORAGE_KEY);
    if (isNotebookAreaFilter(raw)) return raw;
  } catch {
    // Unreadable storage: fall back to the default area.
  }
  return DEFAULT_NOTEBOOK_AREA_FILTER;
}

type AreaState = {
  area: NotebookAreaFilter;
  setArea: (area: NotebookAreaFilter) => void;
};

const AreaContext = createContext<AreaState | null>(null);

/** Renders nothing until the stored area is read, so screens never flash the default. */
export const AreaProvider = ({
  store,
  children,
}: {
  store: KeyValueStore;
  children: ReactNode;
}) => {
  const [area, setAreaState] = useState<NotebookAreaFilter | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readStoredArea(store).then((stored) => {
      if (!cancelled) setAreaState((current) => current ?? stored);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const setArea = useCallback(
    (next: NotebookAreaFilter) => {
      setAreaState(next);
      store.setItem(NOTEBOOK_AREA_STORAGE_KEY, next).catch(() => {
        // Not persisted; the choice still holds for this run.
      });
    },
    [store],
  );

  const value = useMemo(
    () => (area ? { area, setArea } : null),
    [area, setArea],
  );
  if (!value) return null;
  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
};

export function useArea(): AreaState {
  const value = useContext(AreaContext);
  if (!value) throw new Error('useArea needs an AreaProvider');
  return value;
}
