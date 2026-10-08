import { createElement, type ReactNode } from 'react';

/** In-memory stand-ins for the native modules the cache and network code use. */
export const asyncStorage = (() => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
    clear: async () => {
      data.clear();
    },
    getAllKeys: async () => [...data.keys()],
  };
})();

type NetListener = (state: { isConnected: boolean | null }) => void;

export const netInfo = (() => {
  const listeners = new Set<NetListener>();
  let connected: boolean | null = true;
  return {
    addEventListener: (listener: NetListener) => {
      listeners.add(listener);
      listener({ isConnected: connected });
      return () => {
        listeners.delete(listener);
      };
    },
    setConnected: (next: boolean) => {
      connected = next;
      for (const listener of [...listeners]) listener({ isConnected: next });
    },
  };
})();

type AppStateListener = (state: string) => void;

export const appState = (() => {
  const listeners = new Set<AppStateListener>();
  return {
    addEventListener: (_type: 'change', listener: AppStateListener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit: (state: string) => {
      for (const listener of [...listeners]) listener(state);
    },
  };
})();

const host = (name: string) => {
  const Host = ({ children, ...props }: { children?: ReactNode }) =>
    createElement(name, props, children);
  Host.displayName = name;
  return Host;
};

export const reactNative = {
  AppState: appState,
  View: host('View'),
  Text: host('Text'),
  StyleSheet: {
    create: <T>(styles: T) => styles,
    hairlineWidth: 0.5,
  },
};

export const safeAreaContext = {
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
};
