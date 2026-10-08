import type { ReactNode } from 'react';
import { useSession } from '../session';
import { CachedQueryProvider } from './CachedQueryProvider';

/** Keys the persisted cache by the signed-in user; signed out persists nothing. */
export const SessionQueryCache = ({ children }: { children: ReactNode }) => {
  const { user } = useSession();
  return (
    <CachedQueryProvider sub={user?.sub ?? null}>
      {children}
    </CachedQueryProvider>
  );
};
