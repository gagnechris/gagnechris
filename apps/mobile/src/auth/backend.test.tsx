import { createApiClient } from '@gagnechris/api-client';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreScreen from '../../app/(tabs)/more/index';
import {
  memorySecureStore,
  memoryStore,
  Providers,
  render,
} from '../../test/render';
import { Alert } from 'react-native';
import {
  createAuthBackend,
  SessionExpiredError,
  type TokenIssuer,
} from './backend';
import { localIssuer } from './local';
import {
  createTokenStore,
  INSTALL_MARKER_KEY,
  KEYCHAIN_KEYS,
  type StoredTokens,
} from './tokenStore';

const FULL = ['site-admin', 'notebook', 'user-admin'];

function fakeIssuer(overrides: Partial<TokenIssuer> = {}): TokenIssuer {
  return {
    signIn: vi.fn(async () => ({
      idToken: 'id:alice:1',
      refreshToken: 'rt-1',
    })),
    refresh: vi.fn(async (rt: string) => ({
      idToken: 'id:alice:2',
      refreshToken: `${rt}+`,
    })),
    revoke: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    user: (idToken) => ({
      sub: idToken.split(':')[1]!,
      email: `${idToken.split(':')[1]}@example.com`,
      name: null,
      groups: ['notebook'],
    }),
    expiresAt: () => Number.POSITIVE_INFINITY,
    ...overrides,
  };
}

function setup(
  issuer: TokenIssuer,
  secure = memorySecureStore(),
  storage = memoryStore(),
) {
  const backend = createAuthBackend({
    issuer,
    tokens: createTokenStore(secure.secure, {
      keychainAccessible: 'test-class',
    }),
    storage: storage.store,
  });
  return { backend, secure, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('session persistence', () => {
  it('stays signed in when the app is killed and relaunched', async () => {
    const first = setup(localIssuer(FULL));
    expect(await first.backend.restore()).toBeNull();
    const signedIn = await first.backend.signIn();
    await first.backend.markInstalled();
    expect(signedIn?.user.sub).toBe('local-dev-user');

    // A new process: new backend, same Keychain and AsyncStorage.
    const relaunched = setup(localIssuer(FULL), first.secure, first.storage);
    expect(await relaunched.backend.restore()).toMatchObject({
      sub: 'local-dev-user',
      groups: FULL,
    });
    expect(await relaunched.backend.getToken()).toBe(
      'local-ios:local-dev-user',
    );
  });

  it('writes every Keychain item with the given accessibility class', async () => {
    const { backend, secure } = setup(fakeIssuer());
    await backend.restore();
    await backend.signIn();
    expect(secure.options.length).toBeGreaterThan(0);
    expect(secure.options.every((o) => 'keychainAccessible' in o)).toBe(true);
  });

  it('drops Keychain items an earlier install left behind', async () => {
    const leftover = memorySecureStore({
      [KEYCHAIN_KEYS.idToken]: 'id:old:1',
      [KEYCHAIN_KEYS.refreshToken]: 'rt-old',
    });
    const { backend, secure, storage } = setup(fakeIssuer(), leftover);
    expect(await backend.restore()).toBeNull();
    expect(secure.data.size).toBe(0);
    expect(storage.data.get(INSTALL_MARKER_KEY)).toBe('1');
  });
});

describe('sign-out', () => {
  it('wipes the tokens, the query cache and AsyncStorage, and revokes the refresh token', async () => {
    const issuer = fakeIssuer();
    const secure = memorySecureStore({
      [KEYCHAIN_KEYS.idToken]: 'id:alice:1',
      [KEYCHAIN_KEYS.refreshToken]: 'rt-1',
      [KEYCHAIN_KEYS.sub]: 'alice',
      [KEYCHAIN_KEYS.signedInAt]: '2026-10-07T00:00:00.000Z',
    });
    const storage = memoryStore({
      [INSTALL_MARKER_KEY]: '1',
      'gagnechris.notebook.areaFilter': 'personal',
      'some-query-cache': '{}',
    });
    const { backend } = setup(issuer, secure, storage);
    const queryClient = new QueryClient();
    queryClient.setQueryData(['notebook', 'notes'], [{ id: 'n1' }]);
    const wipe = vi.fn(async () => {
      queryClient.clear();
      storage.data.clear();
    });

    const renderer = await render(
      <Providers backend={backend} wipe={wipe} store={storage.store}>
        <MoreScreen />
      </Providers>,
    );
    act(() =>
      renderer.root
        .find((n) => n.props.accessibilityLabel === 'Sign out of Notebook')
        .props.onPress(),
    );
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2]!;
    await act(async () =>
      buttons.find((b) => b.text === 'Sign out')!.onPress!(),
    );

    expect(wipe).toHaveBeenCalledOnce();
    expect(issuer.revoke).toHaveBeenCalledWith('rt-1');
    expect(secure.data.size).toBe(0);
    expect(storage.data.size).toBe(0);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(await backend.getToken()).toBeNull();
    // The wipe runs before the tokens go, so nothing is fetched with them after.
    expect(wipe.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(issuer.revoke).mock.invocationCallOrder[0]!,
    );
  });

  it('still deletes the tokens when revocation fails offline', async () => {
    const issuer = fakeIssuer({
      revoke: vi.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    });
    const { backend, secure } = setup(issuer);
    await backend.restore();
    await backend.signIn();
    await backend.signOut();
    expect(secure.data.size).toBe(0);
  });
});

describe('token refresh', () => {
  it('5 concurrent 401s cause one refresh', async () => {
    let resolveRefresh!: () => void;
    const issuer = fakeIssuer({
      refresh: vi.fn(
        (rt: string) =>
          new Promise<StoredTokens>((resolve) => {
            resolveRefresh = () =>
              resolve({ idToken: 'id:alice:2', refreshToken: `${rt}+` });
          }),
      ),
    });
    const { backend } = setup(issuer);
    await backend.restore();
    await backend.signIn();

    const fetchMock = vi.fn(async (request: Request) =>
      request.headers.get('Authorization') === 'Bearer id:alice:2'
        ? Response.json({ status: 'ok', service: 'gagnechris-api' })
        : new Response('{}', { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    // A client each, as screens that build their own would: the token
    // provider alone has to collapse the refreshes.
    const requests = Array.from({ length: 5 }, () =>
      createApiClient({
        baseUrl: 'http://api.test',
        getToken: backend.getToken,
      }).GET('/api/health'),
    );
    await vi.waitFor(() => expect(issuer.refresh).toHaveBeenCalled());
    resolveRefresh();
    const results = await Promise.all(requests);

    expect(issuer.refresh).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
  });

  it('writes the rotated refresh token before any caller gets the new ID token', async () => {
    const issuer = fakeIssuer();
    const { backend, secure } = setup(issuer);
    await backend.restore();
    await backend.signIn();
    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => backend.getToken({ forceRefresh: true })),
    );
    expect(tokens).toEqual(Array(5).fill('id:alice:2'));
    expect(issuer.refresh).toHaveBeenCalledTimes(1);
    expect(secure.data.get(KEYCHAIN_KEYS.refreshToken)).toBe('rt-1+');
  });

  it('refreshes an ID token about to expire before using it', async () => {
    const issuer = fakeIssuer({
      expiresAt: (id) =>
        id.endsWith(':1') ? Date.now() + 30_000 : Number.POSITIVE_INFINITY,
    });
    const { backend } = setup(issuer);
    await backend.restore();
    await backend.signIn();
    expect(await backend.getToken()).toBe('id:alice:2');
  });

  it('a refused refresh ends the session without wiping, and keeps who it was', async () => {
    const issuer = fakeIssuer({
      refresh: vi.fn(async () => {
        throw new SessionExpiredError();
      }),
    });
    const { backend, secure } = setup(issuer);
    await backend.restore();
    await backend.signIn();
    const expired = vi.fn();
    backend.onExpired(expired);

    expect(await backend.getToken({ forceRefresh: true })).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
    expect(secure.data.get(KEYCHAIN_KEYS.refreshToken)).toBeUndefined();
    expect(secure.data.get(KEYCHAIN_KEYS.sub)).toBe('alice');
  });

  it('keeps the tokens when a refresh fails offline', async () => {
    const issuer = fakeIssuer({
      refresh: vi.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    });
    const { backend, secure } = setup(issuer);
    await backend.restore();
    await backend.signIn();
    await expect(backend.getToken({ forceRefresh: true })).rejects.toThrow(
      'Network',
    );
    expect(secure.data.get(KEYCHAIN_KEYS.refreshToken)).toBe('rt-1');
    expect(await backend.getToken()).toBe('id:alice:1');
  });

  it('flags a different user signing in after an expired session', async () => {
    const issuer = fakeIssuer();
    const secure = memorySecureStore({ [KEYCHAIN_KEYS.sub]: 'bob' });
    const { backend } = setup(issuer, secure);
    await backend.restore();
    // restore() on a fresh install clears everything, so seed the sub again.
    secure.data.set(KEYCHAIN_KEYS.sub, 'bob');
    expect((await backend.signIn())?.differentUser).toBe(true);
    expect((await backend.signIn())?.differentUser).toBe(false);
  });
});
