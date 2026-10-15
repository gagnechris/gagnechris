import { useNotebookAreas } from '@gagnechris/app-core';
import {
  NOTEBOOK_AREA_STORAGE_KEY,
  notebookAreaName,
  resolveNotebookArea,
  type NotebookArea,
  type NotebookAreaEntry,
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

/** The stored area id, or null; it is checked against the user's areas when read. */
export async function readStoredArea(
  store: KeyValueStore,
): Promise<string | null> {
  try {
    return await store.getItem(NOTEBOOK_AREA_STORAGE_KEY);
  } catch {
    return null;
  }
}

type StoredAreaState = {
  stored: string | null;
  setArea: (area: NotebookArea) => void;
  /** The device store the area lives in, for other per-device settings. */
  store: KeyValueStore;
};

const AreaContext = createContext<StoredAreaState | null>(null);

/** Renders nothing until the stored area is read, so screens never flash the default. */
export const AreaProvider = ({
  store,
  children,
}: {
  store: KeyValueStore;
  children: ReactNode;
}) => {
  const [stored, setStored] = useState<{ value: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readStoredArea(store).then((value) => {
      if (!cancelled) setStored((current) => current ?? { value });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const setArea = useCallback(
    (next: NotebookArea) => {
      setStored({ value: next });
      store.setItem(NOTEBOOK_AREA_STORAGE_KEY, next).catch(() => {
        // Not persisted; the choice still holds for this run.
      });
    },
    [store],
  );

  const value = useMemo(
    () => (stored ? { stored: stored.value, setArea, store } : null),
    [stored, setArea, store],
  );
  if (!value) return null;
  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
};

type AreaState = {
  /** The switch's area: the stored one while it is still listed, else the first. */
  area: NotebookArea;
  areaName: string;
  areas: readonly NotebookAreaEntry[];
  setArea: (area: NotebookArea) => void;
  store: KeyValueStore;
};

export function useArea(): AreaState {
  const value = useContext(AreaContext);
  if (!value) throw new Error('useArea needs an AreaProvider');
  const areas = useNotebookAreas();
  const area = resolveNotebookArea(value.stored, areas);
  return {
    area,
    areaName: notebookAreaName(areas, area),
    areas,
    setArea: value.setArea,
    store: value.store,
  };
}
