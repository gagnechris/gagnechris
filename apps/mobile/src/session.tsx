import { NOTEBOOK_GROUP } from '@gagnechris/shared';
import type { TokenProvider } from '@gagnechris/api-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { localAuthGroups } from './config';

export type SessionUser = {
  sub: string;
  email: string;
  name: string | null;
  groups: readonly string[];
};

export type AuthBackend = {
  /** The session kept from the last run, if any. */
  restore(): Promise<SessionUser | null>;
  signIn(): Promise<SessionUser | null>;
  signOut(): Promise<void>;
  getToken: TokenProvider;
};

/**
 * The local API's fake auth (`npm run local:dev`): `Bearer local-ios:<sub>`
 * gets ID token claims with the `ios` client as `aud`. Like the web's
 * `VITE_AUTH_MODE=local`, a launch starts signed in.
 */
export function localAuthBackend(
  groups: readonly string[] = localAuthGroups,
): AuthBackend {
  const user: SessionUser = {
    sub: 'local-dev-user',
    email: 'local@gagnechris.com',
    name: 'Local Admin',
    groups,
  };
  return {
    restore: async () => user,
    signIn: async () => user,
    signOut: async () => {},
    getToken: async () => `local-ios:${user.sub}`,
  };
}

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

type SessionState = {
  status: SessionStatus;
  user: SessionUser | null;
  hasNotebook: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: TokenProvider;
};

const SessionContext = createContext<SessionState | null>(null);

export const SessionProvider = ({
  backend,
  children,
}: {
  backend: AuthBackend;
  children: ReactNode;
}) => {
  const [status, setStatus] = useState<SessionStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void backend
      .restore()
      .catch(() => null)
      .then((restored) => {
        if (cancelled) return;
        setUser(restored);
        setStatus(restored ? 'signedIn' : 'signedOut');
      });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const signIn = useCallback(async () => {
    const signedIn = await backend.signIn();
    if (!signedIn) return;
    setUser(signedIn);
    setStatus('signedIn');
  }, [backend]);

  const signOut = useCallback(async () => {
    try {
      await backend.signOut();
    } finally {
      setUser(null);
      setStatus('signedOut');
    }
  }, [backend]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      hasNotebook: user?.groups.includes(NOTEBOOK_GROUP) ?? false,
      signIn,
      signOut,
      getToken: backend.getToken,
    }),
    [status, user, signIn, signOut, backend],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession needs a SessionProvider');
  return value;
}

export function displayName(user: SessionUser): string {
  return user.name?.trim() || user.email;
}

export function initials(user: SessionUser): string {
  const source = user.name?.trim() || user.email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source[0];
  return letters.toUpperCase();
}

/** Which root screens a session may see: the tabs, No access, or sign-in. */
export function rootGuards(status: SessionStatus, hasNotebook: boolean) {
  const signedIn = status === 'signedIn';
  return {
    notebook: signedIn && hasNotebook,
    noAccess: signedIn && !hasNotebook,
    signIn: status === 'signedOut',
  };
}
