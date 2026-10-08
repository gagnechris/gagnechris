import type { ComponentType } from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreScreen from '../app/(tabs)/more/index';
import NotesScreen from '../app/(tabs)/notes/index';
import TasksScreen from '../app/(tabs)/tasks/index';
import TodayScreen from '../app/(tabs)/today/index';
import UpcomingScreen from '../app/(tabs)/upcoming/index';
import NoAccessScreen from '../app/no-access';
import SignInScreen from '../app/sign-in';
import {
  allText,
  byLabel,
  memoryStore,
  Providers,
  render,
  signedInBackend,
} from '../test/render';
import { MIN_TARGET } from './theme';

const flatStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatStyle))
    : style && typeof style === 'object'
      ? (style as Record<string, unknown>)
      : {};

const hosts = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node) => node.type === type);

/** What VoiceOver and Dynamic Type need from every screen. */
function expectAccessible(renderer: ReactTestRenderer) {
  for (const pressable of hosts(renderer, 'Pressable')) {
    expect(pressable.props.accessibilityLabel, 'labelled control').toEqual(
      expect.any(String),
    );
    expect(pressable.props.accessibilityRole, 'control role').toMatch(
      /^(button|tab)$/,
    );
    expect(flatStyle(pressable.props.style).minHeight).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
  }
  for (const text of hosts(renderer, 'Text')) {
    // A line cap or a scaling cap is what clips text at XXL.
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    const style = flatStyle(text.props.style);
    expect(style.height, 'fixed text height').toBeUndefined();
  }
  for (const icon of hosts(renderer, 'SymbolView')) {
    expect(icon.props.accessible).toBe(false);
  }
}

const headers = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node: ReactTestInstance) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === 'header',
  );

const TABS: [string, ComponentType][] = [
  ['Today', TodayScreen],
  ['Upcoming', UpcomingScreen],
  ['Notes', NotesScreen],
  ['Tasks', TasksScreen],
  ['More', MoreScreen],
];

describe('Notebook tab screens', () => {
  afterEach(() => vi.clearAllMocks());

  it.each(TABS)(
    '%s renders its shell with labelled, scalable controls',
    async (_, Screen) => {
      const renderer = await render(
        <Providers>
          <Screen />
        </Providers>,
      );
      expect(allText(renderer)).not.toBe('');
      expectAccessible(renderer);
    },
  );

  it('Today heads the page with the date and offers the area chip', async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 2, 9) });
    const renderer = await render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    vi.useRealTimers();
    expect(headers(renderer)[0]?.props.accessibilityLabel).toBe(
      'Today, Friday, October 2',
    );
    expect(allText(renderer)).toContain('Nothing written today');

    act(() => byLabel(renderer, 'Area: Work').props.onPress());
    const [options, choose] = vi.mocked(
      ActionSheetIOS.showActionSheetWithOptions,
    ).mock.calls[0]!;
    expect(options.options).toEqual(['Work', 'Personal', 'All', 'Cancel']);
    await act(async () => choose(2));
    expect(byLabel(renderer, 'Area: All')).toBeDefined();
  });

  it('empty states match each artboard', async () => {
    const expected: [ComponentType, string][] = [
      [UpcomingScreen, 'Nothing scheduled'],
      [NotesScreen, 'No notes yet'],
      [TasksScreen, 'No open tasks'],
    ];
    for (const [Screen, title] of expected) {
      const renderer = await render(
        <Providers>
          <Screen />
        </Providers>,
      );
      expect(allText(renderer)).toContain(title);
    }
  });

  it('More shows the account, Notebook as the only app, and signs out', async () => {
    const backend = signedInBackend();
    const signOut = vi.spyOn(backend, 'signOut');
    const renderer = await render(
      <Providers backend={backend} store={memoryStore().store}>
        <MoreScreen />
      </Providers>,
    );
    const text = allText(renderer);
    expect(text).toContain('Local Admin');
    expect(text).toContain('local@gagnechris.com');
    expect(text).toContain('Full Admin');
    expect(byLabel(renderer, 'Notebook, current app')).toBeDefined();
    expect(text.split('\n')).not.toContain('Admin');
    expect(text).not.toContain('Public site');

    act(() => byLabel(renderer, 'Sign out of Notebook').props.onPress());
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2]!;
    await act(async () =>
      buttons.find((b) => b.text === 'Sign out')!.onPress!(),
    );
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe('No access', () => {
  it('explains who is signed in and offers sign-out', async () => {
    const backend = signedInBackend(['site-admin']);
    const signOut = vi.spyOn(backend, 'signOut');
    const renderer = await render(
      <Providers backend={backend}>
        <NoAccessScreen />
      </Providers>,
    );
    const text = allText(renderer);
    expect(headers(renderer)[0]?.props.children).toBe(
      'You don’t have access to Notebook',
    );
    expect(text).toContain('local@gagnechris.com');
    expect(text).toContain('Public CMS');
    expectAccessible(renderer);
    await act(async () => byLabel(renderer, 'Sign out').props.onPress());
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('sign-in screen is accessible', async () => {
    const renderer = await render(
      <Providers>
        <SignInScreen />
      </Providers>,
    );
    expectAccessible(renderer);
  });
});
