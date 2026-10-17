import { clearPendingFlushes } from '@gagnechris/app-core';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { openBrowserAsync } from 'expo-web-browser';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectScreen from '../app/admin/projects/[id]';
import ProjectsScreen from '../app/admin/projects/index';
import { adminServer, makeProject } from '../test/adminServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router, searchParams } from '../test/router';

let server: ReturnType<typeof adminServer>;
let mounted: ReactTestRenderer | null = null;

const serve = (...projects: ReturnType<typeof makeProject>[]) => {
  server = adminServer([], projects);
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

const pickAction = (label: string) => {
  const [[{ options }, choose]] = vi.mocked(
    ActionSheetIOS.showActionSheetWithOptions,
  ).mock.calls as unknown as [[{ options: string[] }, (i: number) => void]];
  act(() => choose(options.indexOf(label)));
};

const pickPhoto = () =>
  vi.mocked(launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        uri: 'file:///photos/card.jpg',
        mimeType: 'image/jpeg',
        fileName: 'card.jpg',
        width: 10,
        height: 10,
      },
    ],
  } as never);

describe('Projects list', () => {
  it('lists projects by order with stage, status, page and order', async () => {
    serve(
      makeProject('b', { name: 'Second', order: 2, stack: ['Go'] }),
      makeProject('a', {
        name: 'First',
        slug: 'first',
        order: 1,
        stage: 'live',
        bodyMarkdown: 'Body',
      }),
    );
    const renderer = await show(<ProjectsScreen />);
    const text = allText(renderer);
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
    expect(text).toContain('Live · Published · /projects/first · Order 1');
    expect(text).toContain('Go');
  });

  it('creates a project at the end of the list and opens it', async () => {
    serve(makeProject('a', { order: 4 }));
    const renderer = await show(<ProjectsScreen />);
    await act(async () => byLabel(renderer, 'New project').props.onPress());
    await settle(10);
    const created = server.state.projectStore.get('new-1')!;
    expect(created).toMatchObject({ name: 'Untitled project', order: 5 });
    expect(created.slug).toMatch(/^untitled-project-[a-z0-9]{6}$/);
    expect(router.push).toHaveBeenCalledWith('/admin/projects/new-1');
  });

  it('offers starter projects when there are none', async () => {
    serve();
    const renderer = await show(<ProjectsScreen />);
    await act(async () =>
      byLabel(renderer, 'Create starter projects').props.onPress(),
    );
    await settle(10);
    expect(server.state.projectStore.size).toBeGreaterThan(0);
    expect(
      [...server.state.projectStore.values()].every(
        (p) => p.status === 'draft',
      ),
    ).toBe(true);
  });
});

describe('Project editor', () => {
  beforeEach(() => {
    searchParams.current = { id: 'p1' };
  });

  it('saves the name, with the slug following it on a new project', async () => {
    serve(
      makeProject('p1', {
        name: 'Untitled project',
        slug: 'untitled-project-abc123',
        status: 'draft',
        publishedAt: null,
      }),
    );
    const renderer = await show(<ProjectScreen />);
    act(() => input(renderer, 'Name').props.onChangeText('Field Notes'));
    act(() => input(renderer, 'Body').props.onChangeText('What it is.'));
    await vi.waitFor(() =>
      expect(server.state.projectStore.get('p1')).toMatchObject({
        name: 'Field Notes',
        slug: 'field-notes',
        bodyMarkdown: 'What it is.',
      }),
    );
  });

  it('keeps an invalid order off the server and says why', async () => {
    serve(makeProject('p1', { order: 3, status: 'draft' }));
    const renderer = await show(<ProjectScreen />);
    act(() => byLabel(renderer, 'Details').props.onPress());
    act(() => input(renderer, 'Order').props.onChangeText('x'));
    act(() => input(renderer, 'Stage note').props.onChangeText('for fun'));
    await vi.waitFor(() =>
      expect(server.state.projectStore.get('p1')).toMatchObject({
        stageNote: 'for fun',
        order: 3,
      }),
    );
    expect(allText(renderer)).toContain('A whole number from 0 to');
  });

  it('won’t publish a demo without a preview image, then publishes once one is added', async () => {
    serve(makeProject('p1', { status: 'draft', demo: 'posts' }));
    const renderer = await show(<ProjectScreen />);
    await act(async () => byLabel(renderer, 'Publish').props.onPress());
    await settle(5);
    expect(server.state.projectStore.get('p1')!.status).toBe('draft');
    expect(allText(renderer)).toContain(
      'Not published: fix the fields marked in Details first.',
    );

    act(() => byLabel(renderer, 'Details').props.onPress());
    pickPhoto();
    await act(async () => byLabel(renderer, 'Choose a photo').props.onPress());
    await settle(10);
    await act(async () => byLabel(renderer, 'Publish').props.onPress());
    await settle(10);
    expect(server.state.projectStore.get('p1')).toMatchObject({
      status: 'published',
      previewImage: '/media/upload-1.jpg',
    });
  });

  it('saves links and stack from Details', async () => {
    serve(makeProject('p1', { status: 'draft' }));
    const renderer = await show(<ProjectScreen />);
    act(() => byLabel(renderer, 'Details').props.onPress());
    act(() => byLabel(renderer, 'Add link').props.onPress());
    act(() => input(renderer, 'Link 1 label').props.onChangeText('Source'));
    act(() =>
      input(renderer, 'Link 1 URL').props.onChangeText(
        'https://github.com/gagnechris',
      ),
    );
    vi.mocked(Alert.prompt).mockImplementationOnce((_t, _m, callback) =>
      (callback as (v: string) => void)('Swift'),
    );
    act(() => byLabel(renderer, 'Add technology').props.onPress());
    await vi.waitFor(() =>
      expect(server.state.projectStore.get('p1')).toMatchObject({
        links: [{ label: 'Source', url: 'https://github.com/gagnechris' }],
        stack: ['Swift'],
      }),
    );
  });

  it('a published project with no page offers Unpublish but no View on site', async () => {
    serve(
      makeProject('p1', {
        stage: 'idea',
        bodyMarkdown: '',
        href: null,
        status: 'published',
      }),
    );
    const renderer = await show(<ProjectScreen />);
    act(() => byLabel(renderer, 'Project actions').props.onPress());
    const [[{ options }]] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
      .mock.calls as unknown as [[{ options: string[] }]];
    expect(options).toContain('Unpublish');
    expect(options).not.toContain('View on site');
  });

  it('opens the card’s link target on the site', async () => {
    serve(makeProject('p1', { href: '/dont-feed-the-bears' }));
    const renderer = await show(<ProjectScreen />);
    act(() => byLabel(renderer, 'Project actions').props.onPress());
    pickAction('View on site');
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://gagnechris.com/dont-feed-the-bears',
    );
  });
});
