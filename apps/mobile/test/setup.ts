import { createElement, type ReactNode } from 'react';
import { beforeEach, vi } from 'vitest';
import { notebookServer } from './notebookServer';
import { searchParams } from './router';

/**
 * react-native ships Flow sources Node can't load, so screen tests render
 * plain host elements with the same props. The tree keeps every
 * accessibility prop and style, which is what the tests read.
 */
const host = (name: string) => {
  const Host = ({ children, ...props }: { children?: ReactNode }) =>
    createElement(name, props, children);
  Host.displayName = name;
  return Host;
};

const Pressable = ({
  children,
  style,
  ...props
}: {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  style?: unknown;
}) =>
  createElement(
    'Pressable',
    {
      ...props,
      style: typeof style === 'function' ? style({ pressed: false }) : style,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  );

vi.mock('react-native', () => ({
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  Pressable,
  TextInput: host('TextInput'),
  RefreshControl: host('RefreshControl'),
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => undefined }),
  },
  StyleSheet: {
    create: <T>(styles: T) => styles,
    hairlineWidth: 0.5,
  },
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
  Alert: { alert: vi.fn() },
}));

vi.mock('expo-symbols', () => ({ SymbolView: host('SymbolView') }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

/** A screen's header items render inline, so tests can press them. */
const StackScreen = ({
  options,
}: {
  options?: {
    headerRight?: () => ReactNode;
    headerLeft?: () => ReactNode;
  };
}) =>
  createElement(
    'Header',
    null,
    options?.headerLeft?.(),
    options?.headerRight?.(),
  );

vi.mock('expo-router', async () => {
  const { router, searchParams } = await import('./router');
  return {
    useRouter: () => router,
    useLocalSearchParams: () => searchParams.current,
    Stack: Object.assign(host('Stack'), { Screen: StackScreen }),
  };
});

beforeEach(() => {
  vi.stubGlobal('fetch', notebookServer([]).fetch);
  searchParams.current = {};
});

vi.mock('@react-native-community/netinfo', async () => ({
  default: (await import('./nativeFakes')).netInfo,
}));
