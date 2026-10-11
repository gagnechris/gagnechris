import {
  NOTEBOOK_GROUP,
  SITE_ADMIN_GROUP,
  USER_ADMIN_GROUP,
} from '@gagnechris/shared';
import type { Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { KeyValueStore } from './area';

export type Space = 'notebook' | 'admin';

export const SPACE_STORAGE_KEY = 'gagnechris.space';

export const SPACE_HOME: Record<Space, Href> = {
  notebook: '/today',
  admin: '/admin/posts',
};

/** The spaces a user's groups open, Notebook first. */
export function spacesFor(groups: readonly string[]): Space[] {
  const spaces: Space[] = [];
  if (groups.includes(NOTEBOOK_GROUP)) spaces.push('notebook');
  if (groups.includes(SITE_ADMIN_GROUP)) spaces.push('admin');
  return spaces;
}

export const canManageUsers = (groups: readonly string[]) =>
  groups.includes(USER_ADMIN_GROUP);

/** The last space used when the user still has it, else their first. */
export function openingSpace(
  last: string | null,
  spaces: readonly Space[],
): Space | null {
  const remembered = spaces.find((space) => space === last);
  return remembered ?? spaces[0] ?? null;
}

type SpaceState = {
  last: string | null;
  remember: (space: Space) => void;
};

const SpaceContext = createContext<SpaceState | null>(null);

/** Renders nothing until the stored space is read, so launch opens it directly. */
export const SpaceProvider = ({
  store,
  children,
}: {
  store: KeyValueStore;
  children: ReactNode;
}) => {
  const [last, setLast] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void store
      .getItem(SPACE_STORAGE_KEY)
      .catch(() => null)
      .then((stored) => {
        if (!cancelled) setLast((current) => current ?? stored);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const remember = useCallback(
    (space: Space) => {
      setLast(space);
      store.setItem(SPACE_STORAGE_KEY, space).catch(() => {
        // Not persisted; launch falls back to the first space.
      });
    },
    [store],
  );

  const value = useMemo(
    () => (last === undefined ? null : { last, remember }),
    [last, remember],
  );
  if (!value) return null;
  return (
    <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>
  );
};

export function useSpace(): SpaceState {
  const value = useContext(SpaceContext);
  if (!value) throw new Error('useSpace needs a SpaceProvider');
  return value;
}

/** Records `space` as the one to reopen while its tab bar is mounted. */
export function useRememberSpace(space: Space) {
  const { last, remember } = useSpace();
  useEffect(() => {
    if (last !== space) remember(space);
  }, [last, remember, space]);
}
