import { createElement, type ReactNode } from 'react';
import { beforeEach, vi } from 'vitest';
import { notebookServer } from './notebookServer';
import { searchParams, segments } from './router';

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

vi.mock('expo-sqlite', async () => (await import('./expoSqlite')).expoSqlite);

vi.mock('react-native', () => ({
  View: host('View'),
  Text: host('Text'),
  Image: host('Image'),
  ScrollView: host('ScrollView'),
  Pressable,
  TextInput: host('TextInput'),
  RefreshControl: host('RefreshControl'),
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn(() => ({ remove: () => undefined })),
  },
  StyleSheet: {
    create: <T>(styles: T) => styles,
    hairlineWidth: 0.5,
    absoluteFill: {},
  },
  Animated: {
    View: host('Animated.View'),
    Value: class {
      constructor(public value: number) {}
      setValue(value: number) {
        this.value = value;
      }
    },
    spring: () => ({ start: (done?: () => void) => done?.() }),
  },
  // The handlers land on the row as props, so a test can call them as a swipe.
  PanResponder: {
    create: (config: Record<string, unknown>) => ({ panHandlers: config }),
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) =>
      options.ios ?? options.default,
  },
  Linking: { openURL: vi.fn() },
  InputAccessoryView: host('InputAccessoryView'),
  Modal: ({
    visible,
    children,
  }: {
    visible?: boolean;
    children?: ReactNode;
  }) => (visible ? createElement('Modal', null, children) : null),
  Keyboard: { dismiss: vi.fn() },
  Share: { share: vi.fn(async () => ({ action: 'sharedAction' })) },
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
  Alert: { alert: vi.fn(), prompt: vi.fn() },
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: vi.fn(async () => ({ type: 'dismiss' })),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

vi.mock('@react-native-community/datetimepicker', () => ({
  default: host('DateTimePicker'),
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
  const { router, searchParams, segments } = await import('./router');
  return {
    useRouter: () => router,
    useLocalSearchParams: () => searchParams.current,
    useSegments: () => segments.current,
    Stack: Object.assign(host('Stack'), { Screen: StackScreen }),
  };
});

beforeEach(() => {
  vi.stubGlobal('fetch', notebookServer([]).fetch);
  searchParams.current = {};
  segments.current = [];
});

vi.mock('@react-native-community/netinfo', async () => ({
  default: (await import('./nativeFakes')).netInfo,
}));
