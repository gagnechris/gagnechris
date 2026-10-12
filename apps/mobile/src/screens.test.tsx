import type { ComponentType } from 'react';
import { ActionSheetIOS, Alert, Linking } from 'react-native';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MoreScreen from '../app/(tabs)/more/index';
import AdminMoreScreen from '../app/admin/more/index';
import AdminHomePageScreen from '../app/admin/pages/home';
import AdminResumeScreen from '../app/admin/pages/resume';
import AdminPagesScreen from '../app/admin/pages/index';
import AdminUsersScreen from '../app/admin/users/index';
import AdminPostScreen from '../app/admin/posts/[id]';
import AdminPostsScreen from '../app/admin/posts/index';
import AdminProjectScreen from '../app/admin/projects/[id]';
import AdminProjectsScreen from '../app/admin/projects/index';
import Index from '../app/index';
import NotesScreen from '../app/(tabs)/notes/index';
import TaskScreen from '../app/(tabs)/tasks/[id]';
import TasksScreen from '../app/(tabs)/tasks/index';
import NoteScreen from '../app/(tabs)/notes/[id]';
import SearchScreen from '../app/search';
import TodayScreen from '../app/(tabs)/today/index';
import UpcomingScreen from '../app/(tabs)/upcoming/index';
import AdminLayout from '../app/admin/_layout';
import NoAccessScreen from '../app/no-access';
import SignInScreen from '../app/sign-in';
import {
  allText,
  byLabel,
  memoryStore,
  Providers,
  render,
  settle,
  signedInBackend,
} from '../test/render';
import { addPasskeyFromMore } from './auth/passkey';
import { adminServer, makePost, makeProject } from '../test/adminServer';
import { expectAccessible } from '../test/accessible';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { router, searchParams } from '../test/router';
import { canManageUsers, SPACE_STORAGE_KEY, useRememberSpace } from './space';
import { MIN_TARGET } from './theme';

vi.mock('./auth/passkey', () => ({
  canAddPasskey: true,
  addPasskeyFromMore: vi.fn(async () => undefined),
}));

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
    const actions = renderer.root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          ['Area: Work', 'Search'].includes(node.props.accessibilityLabel),
      )
      .map((node) => node.props.accessibilityLabel);
    expect(actions).toEqual(['Area: Work', 'Search']);

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
      await settle();
      expect(allText(renderer)).toContain(title);
    }
  });

  it('More divides the rows in each group', async () => {
    const renderer = await render(
      <Providers>
        <MoreScreen />
      </Providers>,
    );
    const divided = (label: string) =>
      [byLabel(renderer, label).props.style]
        .flat(Infinity)
        .some((rule) => rule?.borderTopWidth > 0);
    expect(divided('Default area, Work')).toBe(false);
    expect(divided('Daily templates')).toBe(true);
    expect(divided('Add a passkey')).toBe(false);
    expect(divided('Sign out of Notebook')).toBe(true);
  });

  it('More shows the account and signs out', async () => {
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

    act(() => byLabel(renderer, 'Add a passkey').props.onPress());
    expect(addPasskeyFromMore).toHaveBeenCalledOnce();

    act(() => byLabel(renderer, 'Sign out of Notebook').props.onPress());
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2]!;
    await act(async () =>
      buttons.find((b) => b.text === 'Sign out')!.onPress!(),
    );
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe('Admin screens', () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ['Posts', AdminPostsScreen],
    ['Post', AdminPostScreen],
    ['Projects', AdminProjectsScreen],
    ['Project', AdminProjectScreen],
    ['Pages', AdminPagesScreen],
    ['Home page', AdminHomePageScreen],
    ['Resume', AdminResumeScreen],
    ['Users', AdminUsersScreen],
  ] as const)('%s has labelled, scalable controls', async (_, Screen) => {
    vi.stubGlobal(
      'fetch',
      adminServer(
        [makePost('x', { tags: ['go'] })],
        [makeProject('x', { stack: ['Go'] })],
      ).fetch,
    );
    searchParams.current = { id: 'x' };
    const renderer = await render(
      <Providers>
        <Screen />
      </Providers>,
    );
    await settle(10);
    expect(allText(renderer)).not.toBe('');
    expectAccessible(renderer);
    act(() => renderer.unmount());
  });
});

describe('Notebook screens with data', () => {
  const LONG =
    'Write the long-form review of the quarter, with every chapter and the appendix tables';
  const HOME = '01NOTE0000000000000000000H';
  const DAILY = '01NOTE0000000000000000000D';
  const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
  const B = '01HTASKBBBBBBBBBBBBBBBBBBB';
  const C = '01HTASKCCCCCCCCCCCCCCCCCCC';

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
    vi.stubGlobal(
      'fetch',
      notebookServer(
        [
          makeNote(HOME, `Plan\n{{task:${B}}}\nThe review needs a draft.`, {
            title: 'Quarter plan',
            taskIds: [B],
          }),
          makeNote(DAILY, `{{task:${A}}}`, {
            type: 'daily',
            date: '2026-10-02',
            title: '',
            taskIds: [A],
          }),
        ],
        [
          makeTask(A, LONG, { noteId: DAILY, startDate: '2026-10-02' }),
          makeTask(B, `${LONG} (home)`, {
            noteId: HOME,
            startDate: '2026-10-05',
            priority: 'high',
            dueDate: '2026-10-06',
          }),
          makeTask(C, 'Someday idea', { someday: true }),
        ],
      ).fetch,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each<[string, ComponentType, Record<string, string>, string]>([
    ['Today', TodayScreen, {}, LONG],
    ['Upcoming', UpcomingScreen, {}, LONG],
    ['Notes', NotesScreen, {}, 'Quarter plan'],
    ['Tasks', TasksScreen, {}, LONG],
    ['Task detail', TaskScreen, { id: B }, 'Quarter plan'],
    ['Note', NoteScreen, { id: HOME }, LONG],
  ])('%s keeps its rows accessible', async (_, Screen, params, shown) => {
    searchParams.current = params;
    const renderer = await render(
      <Providers>
        <Screen />
      </Providers>,
    );
    await settle(15);
    const fields = renderer.root
      .findAll((node) => (node.type as string) === 'TextInput')
      .map((node) => String(node.props.value ?? ''));
    expect([allText(renderer), ...fields].join('\n')).toContain(shown);
    expectAccessible(renderer);
    act(() => renderer.unmount());
  });

  it('Search keeps its hits accessible', async () => {
    const renderer = await render(
      <Providers>
        <SearchScreen />
      </Providers>,
    );
    act(() =>
      byLabel(renderer, 'Search notes and tasks').props.onChangeText('review'),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    await settle(15);
    expect(allText(renderer)).toContain('Quarter plan');
    expectAccessible(renderer);
    act(() => renderer.unmount());
  });

  it('Upcoming offers the home note to VoiceOver with a 44pt target', async () => {
    const renderer = await render(
      <Providers>
        <UpcomingScreen />
      </Providers>,
    );
    await settle(15);
    const row = byLabel(renderer, `${LONG} (home), Quarter plan, due Tue`);
    expect(row.props.accessibilityActions).toContainEqual({
      name: 'openNote',
      label: 'Open Quarter plan',
    });
    act(() =>
      row.props.onAccessibilityAction({
        nativeEvent: { actionName: 'openNote' },
      }),
    );
    expect(router.push).toHaveBeenCalledWith(`/notes/${HOME}`);

    const chip = byLabel(renderer, 'Open Quarter plan');
    const { minHeight } = [chip.props.style].flat()[0] as { minHeight: number };
    expect(
      minHeight + chip.props.hitSlop.top + chip.props.hitSlop.bottom,
    ).toBeGreaterThanOrEqual(MIN_TARGET);
    act(() => renderer.unmount());
  });
});

describe('Spaces', () => {
  afterEach(() => vi.clearAllMocks());

  it('a Notebook-only account sees only Notebook under Your apps', async () => {
    const renderer = await render(
      <Providers backend={signedInBackend(['notebook'])}>
        <MoreScreen />
      </Providers>,
    );
    expect(byLabel(renderer, 'Notebook, current app')).toBeDefined();
    expect(allText(renderer).split('\n')).not.toContain('Admin');
  });

  it('a Full Admin switches from Notebook to Admin and back', async () => {
    const renderer = await render(
      <Providers>
        <MoreScreen />
      </Providers>,
    );
    act(() => byLabel(renderer, 'Admin').props.onPress());
    expect(router.replace).toHaveBeenLastCalledWith('/admin/posts');

    const admin = await render(
      <Providers>
        <AdminMoreScreen />
      </Providers>,
    );
    expect(byLabel(admin, 'Admin, current app')).toBeDefined();
    act(() => byLabel(admin, 'Notebook').props.onPress());
    expect(router.replace).toHaveBeenLastCalledWith('/today');
    act(() => byLabel(admin, 'Public site').props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith('https://gagnechris.com');
    vi.mocked(addPasskeyFromMore).mockClear();
    act(() => byLabel(admin, 'Add a passkey').props.onPress());
    expect(addPasskeyFromMore).toHaveBeenCalledOnce();
  });

  it('reopens in the last space the user still has', async () => {
    const redirectTo = async (groups: string[], last?: string) => {
      const { store } = memoryStore(last ? { [SPACE_STORAGE_KEY]: last } : {});
      const renderer = await render(
        <Providers backend={signedInBackend(groups)} store={store}>
          <Index />
        </Providers>,
      );
      await settle();
      return renderer.root.findByType('Redirect' as never).props.href;
    };
    expect(await redirectTo(['notebook', 'site-admin'])).toBe('/today');
    expect(await redirectTo(['notebook', 'site-admin'], 'admin')).toBe(
      '/admin/posts',
    );
    expect(await redirectTo(['notebook'], 'admin')).toBe('/today');
    expect(await redirectTo(['site-admin'])).toBe('/admin/posts');
  });

  it('opening a space remembers it for the next launch', async () => {
    const { store, data } = memoryStore();
    const Remember = () => {
      useRememberSpace('admin');
      return null;
    };
    await render(
      <Providers store={store}>
        <Remember />
      </Providers>,
    );
    await settle();
    expect(data.get(SPACE_STORAGE_KEY)).toBe('admin');
  });

  it('shows the Users tab only to user admins', () => {
    expect(canManageUsers(['site-admin', 'user-admin'])).toBe(true);
    expect(canManageUsers(['site-admin'])).toBe(false);
  });

  it('sends an admin link opened without Admin to No access', async () => {
    const renderer = await render(
      <Providers backend={signedInBackend(['notebook'])}>
        <AdminLayout />
      </Providers>,
    );
    expect(
      renderer.root.find((node) => (node.type as string) === 'Redirect').props
        .href,
    ).toEqual({ pathname: '/no-access', params: { space: 'admin' } });
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
      'You don’t have access to this app',
    );
    expect(text).toContain('local@gagnechris.com');
    expect(text).toContain('Public CMS');
    expectAccessible(renderer);
    await act(async () => byLabel(renderer, 'Sign out').props.onPress());
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('offers the Notebook when an admin link is opened without Admin', async () => {
    searchParams.current = { space: 'admin' };
    const renderer = await render(
      <Providers backend={signedInBackend(['notebook'])}>
        <NoAccessScreen />
      </Providers>,
    );
    expect(headers(renderer)[0]?.props.children).toBe(
      'You don’t have Admin access',
    );
    expect(allText(renderer)).toContain('Ask a Full Admin if you need Admin.');
    expectAccessible(renderer);
    act(() => byLabel(renderer, 'Open Notebook').props.onPress());
    expect(router.replace).toHaveBeenCalledWith('/today');
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
