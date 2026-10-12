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
import { spacesFor, type Space } from './space';

export type SessionUser = {
  sub: string;
  email: string;
  name: string | null;
  groups: readonly string[];
};

export type SignInResult = {
  user: SessionUser;
  /** Someone else signed in last: their cached data must go before anything renders. */
  differentUser: boolean;
};

export type AuthBackend = {
  /** The session kept from the last run, if any. */
  restore(): Promise<SessionUser | null>;
  signIn(options?: { newAccount?: boolean }): Promise<SignInResult | null>;
  /** Revokes the refresh token and deletes the Keychain items. */
  signOut(): Promise<void>;
  /** Signs the same account in again; false when cancelled or a different account signed in. */
  reauthenticate(): Promise<boolean>;
  getToken: TokenProvider;
  /** Called when a refresh is refused; the session ends without a wipe. */
  onExpired(listener: () => void): () => void;
  /** Records this install after sign-in, once any wipe has run. */
  markInstalled(): Promise<void>;
};

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

type SessionState = {
  status: SessionStatus;
  user: SessionUser | null;
  /** The spaces the user's groups open; none means No access. */
  spaces: readonly Space[];
  /** The last session ended on its own (refresh refused), not by signing out. */
  expired: boolean;
  signIn: (options?: { newAccount?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  reauthenticate: () => Promise<boolean>;
  getToken: TokenProvider;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * `wipe` removes everything cached for the signed-in user (the query cache
 * and AsyncStorage). It runs on sign-out before the tokens go, and before a
 * different user's first render.
 */
export const SessionProvider = ({
  backend,
  wipe,
  children,
}: {
  backend: AuthBackend;
  wipe: () => Promise<void>;
  children: ReactNode;
}) => {
  const [status, setStatus] = useState<SessionStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [expired, setExpired] = useState(false);

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
    const stopListening = backend.onExpired(() => {
      setExpired(true);
      setUser(null);
      setStatus('signedOut');
    });
    return () => {
      cancelled = true;
      stopListening();
    };
  }, [backend]);

  const signIn = useCallback(
    async (options?: { newAccount?: boolean }) => {
      const result = await backend.signIn(options);
      if (!result) return;
      if (result.differentUser) await wipe();
      await backend.markInstalled();
      setExpired(false);
      setUser(result.user);
      setStatus('signedIn');
    },
    [backend, wipe],
  );

  const signOut = useCallback(async () => {
    try {
      await wipe();
      await backend.signOut();
    } finally {
      setExpired(false);
      setUser(null);
      setStatus('signedOut');
    }
  }, [backend, wipe]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      spaces: user ? spacesFor(user.groups) : [],
      expired,
      signIn,
      signOut,
      reauthenticate: backend.reauthenticate,
      getToken: backend.getToken,
    }),
    [status, user, expired, signIn, signOut, backend],
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

/** Which signed-in root screens a session may see; the Site space is open to everyone. */
export function rootGuards(status: SessionStatus, spaces: readonly Space[]) {
  const signedIn = status === 'signedIn';
  return {
    notebook: signedIn && spaces.includes('notebook'),
    // Any space can open an admin link; the admin layout sends a user without
    // Admin to No access.
    admin: signedIn && spaces.length > 0,
    noAccess: signedIn && !spaces.includes('admin'),
  };
}
