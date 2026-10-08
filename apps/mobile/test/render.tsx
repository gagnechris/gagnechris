import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import type { ReactElement, ReactNode } from 'react';
import { AreaProvider, type KeyValueStore } from '../src/area';
import { createAuthBackend } from '../src/auth/backend';
import { localIssuer } from '../src/auth/local';
import {
  createTokenStore,
  INSTALL_MARKER_KEY,
  KEYCHAIN_KEYS,
  type SecureStoreLike,
} from '../src/auth/tokenStore';
import { SessionProvider, type AuthBackend } from '../src/session';

export function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return { store, data };
}

export function memorySecureStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const options: object[] = [];
  const secure: SecureStoreLike = {
    getItemAsync: async (key, opts) => {
      if (opts) options.push(opts);
      return data.get(key) ?? null;
    },
    setItemAsync: async (key, value, opts) => {
      if (opts) options.push(opts);
      data.set(key, value);
    },
    deleteItemAsync: async (key, opts) => {
      if (opts) options.push(opts);
      data.delete(key);
    },
  };
  return { secure, data, options };
}

/** A local-auth backend already signed in, as after a relaunch. */
export function signedInBackend(
  groups: readonly string[] = ['site-admin', 'notebook', 'user-admin'],
): AuthBackend {
  const { secure } = memorySecureStore({
    [KEYCHAIN_KEYS.idToken]: 'local-ios:local-dev-user',
    [KEYCHAIN_KEYS.refreshToken]: 'local-refresh:local-dev-user',
  });
  return createAuthBackend({
    issuer: localIssuer(groups),
    tokens: createTokenStore(secure, {}),
    storage: memoryStore({ [INSTALL_MARKER_KEY]: '1' }).store,
  });
}

export const Providers = ({
  store = memoryStore().store,
  backend = signedInBackend(),
  wipe = async () => {},
  children,
}: {
  store?: KeyValueStore;
  backend?: AuthBackend;
  wipe?: () => Promise<void>;
  children: ReactNode;
}) => (
  <SessionProvider backend={backend} wipe={wipe}>
    <AreaProvider store={store}>{children}</AreaProvider>
  </SessionProvider>
);

/** Renders and lets the providers' async restores settle. */
export async function render(
  element: ReactElement,
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

export const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

export const allText = (renderer: ReactTestRenderer): string =>
  renderer.root
    .findAllByType('Text' as never)
    .map(textOf)
    .join('\n');

export const byLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
