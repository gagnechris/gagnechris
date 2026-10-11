import { clearPendingFlushes } from '@gagnechris/app-core';
import { openBrowserAsync } from 'expo-web-browser';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePageScreen from '../app/admin/pages/home';
import PagesScreen from '../app/admin/pages/index';
import { adminServer, makeHome } from '../test/adminServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router } from '../test/router';

let server: ReturnType<typeof adminServer>;
let mounted: ReactTestRenderer | null = null;

const serve = (home = makeHome()) => {
  server = adminServer([], [], { home });
  vi.stubGlobal('fetch', server.fetch);
};

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  clearPendingFlushes();
  vi.clearAllMocks();
});

const show = async (element: React.ReactElement) => {
  const renderer = await render(<Providers>{element}</Providers>);
  mounted = renderer;
  await settle(10);
  return renderer;
};

const input = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === label,
  );

const row = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'Pressable' &&
      String(node.props.accessibilityLabel).startsWith(`${title},`),
  );

const acceptAlert = () =>
  vi.mocked(Alert.alert).mockImplementationOnce((_t, _m, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });

const pickAction = (label: string) => {
  const [[{ options }, choose]] = vi.mocked(
    ActionSheetIOS.showActionSheetWithOptions,
  ).mock.calls as unknown as [[{ options: string[] }, (i: number) => void]];
  act(() => choose(options.indexOf(label)));
};

describe('Pages list', () => {
  it('lists the home page and resume with their status', async () => {
    serve(makeHome({ hasUnpublishedChanges: true }));
    const renderer = await show(<PagesScreen />);
    const text = allText(renderer);
    expect(text).toContain('Home page');
    expect(text).toContain('Published · unpublished changes');
    expect(text).toContain('Resume');

    act(() => row(renderer, 'Home page').props.onPress());
    expect(router.push).toHaveBeenCalledWith('/admin/pages/home');
    act(() => row(renderer, 'Resume').props.onPress());
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://admin.gagnechris.com/resume',
    );
  });
});

describe('Home page editor', () => {
  it('saves the profile, About me and SEO fields', async () => {
    serve();
    const renderer = await show(<HomePageScreen />);
    act(() => input(renderer, 'Title').props.onChangeText('Builder'));
    act(() => input(renderer, 'About me').props.onChangeText('One.\n\nTwo.'));
    act(() => input(renderer, 'SEO title').props.onChangeText('Chris'));
    await vi.waitFor(() =>
      expect(server.state.pages.home).toMatchObject({
        title: 'Builder',
        about: 'One.\n\nTwo.',
        seo: { title: 'Chris' },
        hasUnpublishedChanges: true,
      }),
    );
  });

  it('publishes a draft, then discards, views and unpublishes from the menu', async () => {
    serve(makeHome({ status: 'draft', publishedAt: null }));
    const renderer = await show(<HomePageScreen />);
    expect(() => byLabel(renderer, 'Home page actions')).toThrow();
    await act(async () => byLabel(renderer, 'Publish').props.onPress());
    await settle(10);
    expect(server.state.pages.home.status).toBe('published');

    act(() => input(renderer, 'Title').props.onChangeText('Changed'));
    await vi.waitFor(() =>
      expect(server.state.pages.home.hasUnpublishedChanges).toBe(true),
    );
    acceptAlert();
    act(() => byLabel(renderer, 'Home page actions').props.onPress());
    pickAction('Discard unpublished changes');
    await settle(10);
    expect(server.state.pages.home.hasUnpublishedChanges).toBe(false);

    vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mockClear();
    act(() => byLabel(renderer, 'Home page actions').props.onPress());
    pickAction('View on site');
    expect(openBrowserAsync).toHaveBeenCalledWith('https://gagnechris.com/');

    vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mockClear();
    acceptAlert();
    act(() => byLabel(renderer, 'Home page actions').props.onPress());
    pickAction('Unpublish');
    await settle(10);
    expect(server.state.pages.home.status).toBe('draft');
  });
});
