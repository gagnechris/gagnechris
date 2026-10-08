import type { TokenProvider } from '@gagnechris/api-client';
import type { KeyValueStore } from '../area';
import type { AuthBackend, SessionUser } from '../session';
import {
  forgetPreviousInstall,
  INSTALL_MARKER_KEY,
  type StoredTokens,
  type TokenStore,
} from './tokenStore';

/** The refresh token was refused (`invalid_grant`): the session is over, but nothing is wiped. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

/** What differs between Cognito and the local API's fake auth. */
export type TokenIssuer = {
  /** `null` when the user closed the sign-in sheet. */
  signIn(options: { newAccount: boolean }): Promise<StoredTokens | null>;
  /** Throws `SessionExpiredError` when the refresh token is refused. */
  refresh(refreshToken: string): Promise<StoredTokens>;
  revoke(refreshToken: string): Promise<void>;
  /** Ends any browser session that would sign the next sign-in straight back in. */
  endSession(): Promise<void>;
  user(idToken: string): SessionUser | null;
  /** Epoch ms. */
  expiresAt(idToken: string): number;
};

/** Refresh this long before expiry, so a request never leaves with a token about to lapse. */
const EXPIRY_MARGIN_MS = 60_000;

export function createAuthBackend({
  issuer,
  tokens,
  storage,
  now = () => Date.now(),
}: {
  issuer: TokenIssuer;
  tokens: TokenStore;
  storage: KeyValueStore;
  now?: () => number;
}): AuthBackend {
  let current: StoredTokens | null = null;
  let refreshing: Promise<string | null> | null = null;
  const expiredListeners = new Set<() => void>();

  const expire = async () => {
    current = null;
    await tokens.clearTokens();
    for (const listener of expiredListeners) listener();
  };

  // Concurrent callers share one refresh; the rotated refresh token is in the
  // Keychain before any of them gets the new ID token.
  const refresh = (): Promise<string | null> => {
    if (refreshing) return refreshing;
    const from = current;
    if (!from) return Promise.resolve(null);
    refreshing = (async () => {
      try {
        const next = await issuer.refresh(from.refreshToken);
        await tokens.write(next);
        current = next;
        return next.idToken;
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          await expire();
          return null;
        }
        // Offline or a server error: keep the tokens we have.
        throw error;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  };

  const getToken: TokenProvider = async (options) => {
    if (!current) return null;
    if (refreshing) return refreshing;
    const fresh = issuer.expiresAt(current.idToken) - EXPIRY_MARGIN_MS > now();
    if (fresh && !options?.forceRefresh) return current.idToken;
    return refresh();
  };

  return {
    async restore() {
      await forgetPreviousInstall(tokens, storage);
      current = await tokens.read();
      return current ? issuer.user(current.idToken) : null;
    },

    async signIn({ newAccount = false } = {}) {
      const signedIn = await issuer.signIn({ newAccount });
      if (!signedIn) return null;
      const user = issuer.user(signedIn.idToken);
      if (!user) return null;
      const previousSub = await tokens.lastSub();
      await tokens.writeSignIn(signedIn, user.sub, new Date(now()));
      current = signedIn;
      return {
        user,
        differentUser: previousSub !== null && previousSub !== user.sub,
      };
    },

    async signOut() {
      const signedOut = current ?? (await tokens.read());
      current = null;
      if (signedOut) {
        await issuer.revoke(signedOut.refreshToken).catch(() => {
          // Revocation is best effort; the tokens go from the Keychain anyway.
        });
      }
      await tokens.clearAll();
      await issuer.endSession().catch(() => {});
    },

    getToken,

    // Sign-out's wipe clears AsyncStorage, marker included; without it the
    // next launch would take these tokens for a previous install's.
    async markInstalled() {
      await storage.setItem(INSTALL_MARKER_KEY, '1');
    },

    onExpired(listener) {
      expiredListeners.add(listener);
      return () => {
        expiredListeners.delete(listener);
      };
    },
  };
}
