import type { KeyValueStore } from '../area';

/** The subset of expo-secure-store the app uses, so tests can pass a map. */
export type SecureStoreLike = {
  getItemAsync(key: string, options?: object): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: object): Promise<void>;
  deleteItemAsync(key: string, options?: object): Promise<void>;
};

export type StoredTokens = {
  idToken: string;
  refreshToken: string;
};

/** One Keychain item per value (ADR 0004 §4). */
export const KEYCHAIN_KEYS = {
  idToken: 'gagnechris.auth.idToken',
  refreshToken: 'gagnechris.auth.refreshToken',
  sub: 'gagnechris.auth.sub',
  signedInAt: 'gagnechris.auth.signedInAt',
} as const;

/** AsyncStorage, unlike the Keychain, doesn't outlive an uninstall. */
export const INSTALL_MARKER_KEY = 'gagnechris.installed';

export type TokenStore = ReturnType<typeof createTokenStore>;

export function createTokenStore(
  secure: SecureStoreLike,
  keychainOptions: object,
) {
  const get = (key: string) => secure.getItemAsync(key, keychainOptions);
  const set = (key: string, value: string) =>
    secure.setItemAsync(key, value, keychainOptions);
  const remove = (key: string) => secure.deleteItemAsync(key, keychainOptions);

  return {
    async read(): Promise<StoredTokens | null> {
      const [idToken, refreshToken] = await Promise.all([
        get(KEYCHAIN_KEYS.idToken),
        get(KEYCHAIN_KEYS.refreshToken),
      ]);
      return idToken && refreshToken ? { idToken, refreshToken } : null;
    },
    /** The refresh token is written first: it's the one a lost write can't recover. */
    async write(tokens: StoredTokens): Promise<void> {
      await set(KEYCHAIN_KEYS.refreshToken, tokens.refreshToken);
      await set(KEYCHAIN_KEYS.idToken, tokens.idToken);
    },
    async writeSignIn(tokens: StoredTokens, sub: string, at: Date) {
      await this.write(tokens);
      await set(KEYCHAIN_KEYS.sub, sub);
      await set(KEYCHAIN_KEYS.signedInAt, at.toISOString());
    },
    /** Who last signed in; kept when a session expires so the next sign-in can tell a different user. */
    lastSub: () => get(KEYCHAIN_KEYS.sub),
    async clearTokens(): Promise<void> {
      await remove(KEYCHAIN_KEYS.idToken);
      await remove(KEYCHAIN_KEYS.refreshToken);
    },
    async clearAll(): Promise<void> {
      await Promise.all(Object.values(KEYCHAIN_KEYS).map(remove));
    },
  };
}

/** On the first launch after an install, drop Keychain items left by an earlier install. */
export async function forgetPreviousInstall(
  tokens: TokenStore,
  storage: KeyValueStore,
): Promise<void> {
  if (await storage.getItem(INSTALL_MARKER_KEY)) return;
  await tokens.clearAll();
  await storage.setItem(INSTALL_MARKER_KEY, '1');
}
