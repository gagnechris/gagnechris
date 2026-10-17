import { clearPendingFlushes } from '@gagnechris/app-core';
import { openBrowserAsync } from 'expo-web-browser';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePageScreen from '../app/admin/pages/home';
import PagesScreen from '../app/admin/pages/index';
import ResumeScreen from '../app/admin/pages/resume';
import { expectReachable } from '../test/accessible';
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
    expect(router.push).toHaveBeenCalledWith('/admin/pages/resume');
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

const roleRow = (renderer: ReactTestRenderer, titleAndCompany: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'Pressable' &&
      String(node.props.accessibilityLabel).startsWith(`${titleAndCompany} · `),
  );

const resumeRole = (index: number) =>
  server.state.pages.resume.content.experience[index]!;

describe('Resume editor', () => {
  it('saves the profile, skills and education', async () => {
    serve();
    const renderer = await show(<ResumeScreen />);
    act(() =>
      input(renderer, 'Headline (current role)').props.onChangeText('CTO'),
    );
    act(() =>
      input(renderer, 'Technical skills (one per line)').props.onChangeText(
        'Go\n Swift \n',
      ),
    );
    act(() => byLabel(renderer, 'Add entry').props.onPress());
    const n = server.state.pages.resume.content.education.length + 1;
    act(() => input(renderer, `Degree, entry ${n}`).props.onChangeText('BSc'));
    await vi.waitFor(() =>
      expect(server.state.pages.resume.content).toMatchObject({
        headline: 'CTO',
        skills: ['Go', 'Swift'],
      }),
    );
    expect(server.state.pages.resume.content.education.at(-1)).toMatchObject({
      title: 'BSc',
    });
  });

  it('edits, moves and removes a role', async () => {
    serve();
    const renderer = await show(<ResumeScreen />);
    act(() =>
      roleRow(
        renderer,
        'Software Engineering Manager, Shutterstock',
      ).props.onPress(),
    );
    act(() => input(renderer, 'Note (optional)').props.onChangeText('remote'));
    act(() =>
      input(renderer, 'Bullets (one per line)').props.onChangeText(
        'Led\nShipped',
      ),
    );
    act(() => byLabel(renderer, 'Move up').props.onPress());
    await vi.waitFor(() =>
      expect(resumeRole(1)).toMatchObject({
        company: 'Shutterstock',
        note: 'remote',
        bullets: ['Led', 'Shipped'],
      }),
    );

    acceptAlert();
    await act(async () => byLabel(renderer, 'Remove role').props.onPress());
    await vi.waitFor(() => expect(resumeRole(1).company).toBe('JW Player'));
    expect(allText(renderer)).not.toContain('Shutterstock');
  });

  it('keeps saved dates for an End before Start and marks the role', async () => {
    serve();
    const renderer = await show(<ResumeScreen />);
    act(() =>
      roleRow(
        renderer,
        'Software Engineering Manager, Shutterstock',
      ).props.onPress(),
    );
    act(() => input(renderer, 'End month').props.onChangeText('2013-01'));
    act(() => input(renderer, 'Note (optional)').props.onChangeText('x'));
    await vi.waitFor(() => expect(resumeRole(2).note).toBe('x'));
    expect(resumeRole(2)).toMatchObject({ start: '2014-09', end: '2017-03' });
    expect(allText(renderer)).toContain(
      'End is before start. The last saved dates are kept until this is fixed.',
    );
    act(() => byLabel(renderer, 'Done').props.onPress());
    expect(allText(renderer)).toContain('Check dates');
  });

  it('won’t publish a new role whose dates were never valid', async () => {
    serve();
    const renderer = await show(<ResumeScreen />);
    act(() => byLabel(renderer, 'Add role').props.onPress());
    act(() => input(renderer, 'Title').props.onChangeText('Advisor'));
    act(() => input(renderer, 'Start month').props.onChangeText('2024-05'));
    act(() => input(renderer, 'End month').props.onChangeText('2024-01'));
    const added = () => server.state.pages.resume.content.experience.at(-1)!;
    await vi.waitFor(() => expect(added().title).toBe('Advisor'));
    expect(added()).not.toHaveProperty('start');
    act(() => byLabel(renderer, 'Done').props.onPress());
    await act(async () => byLabel(renderer, 'Publish').props.onPress());
    await settle(5);
    expect(allText(renderer)).toContain(
      'Not published: fix the dates on Advisor first.',
    );
    expect(server.state.calls).not.toContain('POST /api/admin/resume/publish');
  });

  it('sets a role as current with Present', async () => {
    serve();
    const renderer = await show(<ResumeScreen />);
    act(() => roleRow(renderer, 'Software Architect, Viacom').props.onPress());
    expectReachable(renderer);
    act(() =>
      renderer.root
        .find(
          (node) =>
            (node.type as string) === 'Switch' &&
            node.props.accessibilityLabel === 'Present (current role)',
        )
        .props.onValueChange(true),
    );
    await vi.waitFor(() =>
      expect(resumeRole(3)).toMatchObject({ start: '2014-09', end: null }),
    );
  });
});
