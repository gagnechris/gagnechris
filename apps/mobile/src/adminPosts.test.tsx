import { clearPendingFlushes } from '@gagnechris/app-core';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { openBrowserAsync } from 'expo-web-browser';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostScreen from '../app/admin/posts/[id]';
import PostsScreen from '../app/admin/posts/index';
import {
  makePost,
  makeProject,
  adminServer,
  UPLOAD_URL,
} from '../test/adminServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router, searchParams } from '../test/router';
import {
  followSelection,
  insertImage,
  withSlugSource,
} from './admin/draftEdits';

let server: ReturnType<typeof adminServer>;
let mounted: ReactTestRenderer | null = null;

const serve = (...args: Parameters<typeof adminServer>) => {
  server = adminServer(...args);
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

/** Presses the action sheet item with this label. */
const pickAction = (label: string) => {
  const [[{ options }, choose]] = vi.mocked(
    ActionSheetIOS.showActionSheetWithOptions,
  ).mock.calls as unknown as [[{ options: string[] }, (i: number) => void]];
  act(() => choose(options.indexOf(label)));
};

/** Answers the next confirm alert with its action button. */
const acceptAlert = () =>
  vi.mocked(Alert.alert).mockImplementationOnce((_t, _m, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });

describe('Posts list', () => {
  beforeEach(() =>
    serve([
      makePost('a', { title: 'Draft one', tags: ['go', 'ios'] }),
      makePost('b', {
        title: 'Live one',
        status: 'published',
        publishedAt: '2026-09-30T09:00:00.000Z',
        hasUnpublishedChanges: true,
      }),
    ]),
  );

  it('lists posts with their status, date and tags, and counts each filter', async () => {
    const renderer = await show(<PostsScreen />);
    const text = allText(renderer);
    expect(text).toContain('Draft one');
    expect(text).toContain('Draft · Edited Oct 1, 2026');
    expect(text).toContain('go, ios');
    expect(text).toContain('Published · unpublished changes · Sep 30, 2026');
    expect(text).toContain('All 2');
    expect(text).toContain('Drafts 1');
  });

  it('filters by status on the server', async () => {
    const renderer = await show(<PostsScreen />);
    act(() => byLabel(renderer, 'Published 1').props.onPress());
    await settle(10);
    expect(allText(renderer)).not.toContain('Draft one');
    expect(allText(renderer)).toContain('Live one');
  });

  it('creates a draft and opens it', async () => {
    const renderer = await show(<PostsScreen />);
    await act(async () => byLabel(renderer, 'New post').props.onPress());
    await settle(10);
    const created = [...server.state.store.values()].find((p) =>
      p.id.startsWith('new-'),
    )!;
    expect(created.slug).toMatch(/^untitled-[a-z0-9]{6}$/);
    expect(router.push).toHaveBeenCalledWith(`/admin/posts/${created.id}`);
  });
});

describe('Post editor', () => {
  beforeEach(() => {
    searchParams.current = { id: 'p1' };
  });

  it('saves edits, with the slug following the title of a new draft', async () => {
    serve([makePost('p1', { title: 'Untitled', slug: 'untitled-abc123' })]);
    const renderer = await show(<PostScreen />);
    act(() => input(renderer, 'Title').props.onChangeText('Hello iPhone'));
    act(() => input(renderer, 'Body').props.onChangeText('Some *words*'));
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')).toMatchObject({
        title: 'Hello iPhone',
        slug: 'hello-iphone',
        bodyMarkdown: 'Some *words*',
      }),
    );
  });

  it('stops following the title once a new draft is published', async () => {
    serve([makePost('p1', { title: 'Untitled', slug: 'untitled-abc123' })]);
    const renderer = await show(<PostScreen />);
    act(() => input(renderer, 'Title').props.onChangeText('Hello'));
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')).toMatchObject({ slug: 'hello' }),
    );
    await act(async () => byLabel(renderer, 'Publish').props.onPress());
    await settle(10);
    expect(server.state.store.get('p1')!.status).toBe('published');

    act(() => input(renderer, 'Title').props.onChangeText('Hello again'));
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')).toMatchObject({
        title: 'Hello again',
        slug: 'hello',
      }),
    );
    expect(allText(renderer)).not.toContain('Follows the title');
  });

  it('keeps a hand-set slug when the title changes', async () => {
    serve([makePost('p1', { title: 'Old', slug: 'kept' })]);
    const renderer = await show(<PostScreen />);
    act(() => input(renderer, 'Title').props.onChangeText('New title'));
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')).toMatchObject({
        title: 'New title',
        slug: 'kept',
      }),
    );
  });

  it('publishes a draft', async () => {
    serve([makePost('p1')]);
    const renderer = await show(<PostScreen />);
    await act(async () => byLabel(renderer, 'Publish').props.onPress());
    await settle(10);
    expect(server.state.store.get('p1')!.status).toBe('published');
    expect(allText(renderer)).toContain('Published');
  });

  it('unpublishes after confirming, and opens the live post', async () => {
    serve([
      makePost('p1', {
        slug: 'live',
        status: 'published',
        publishedAt: '2026-09-30T09:00:00.000Z',
      }),
    ]);
    const renderer = await show(<PostScreen />);
    act(() => byLabel(renderer, 'Post actions').props.onPress());
    pickAction('View on site');
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://gagnechris.com/posts/live',
    );

    vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mockClear();
    acceptAlert();
    act(() => byLabel(renderer, 'Post actions').props.onPress());
    pickAction('Unpublish');
    await settle(10);
    expect(server.state.store.get('p1')!.status).toBe('draft');
  });

  it('View on site opens the live slug while the draft is renamed', async () => {
    serve([
      makePost('p1', {
        slug: 'renamed',
        publishedSlug: 'live',
        status: 'published',
        publishedAt: '2026-09-30T09:00:00.000Z',
      }),
    ]);
    const renderer = await show(<PostScreen />);
    act(() => byLabel(renderer, 'Post actions').props.onPress());
    pickAction('View on site');
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://gagnechris.com/posts/live',
    );
  });

  it('adds a photo from the library into the body', async () => {
    serve([makePost('p1', { bodyMarkdown: 'Intro' })]);
    vi.mocked(launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///photos/beach.jpg',
          mimeType: 'image/jpeg',
          fileName: 'beach.jpg',
          width: 10,
          height: 10,
        },
      ],
    } as never);
    const renderer = await show(<PostScreen />);
    act(() =>
      input(renderer, 'Body').props.onSelectionChange({
        nativeEvent: { selection: { start: 5, end: 5 } },
      }),
    );
    await act(async () =>
      renderer.root
        .findByType('InputAccessoryView' as never)
        .find((node) => node.props.accessibilityLabel === 'Photo')
        .props.onPress(),
    );
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')!.bodyMarkdown).toBe(
        'Intro\n\n![beach](/media/upload-1.jpg)\n\n',
      ),
    );
    expect(server.state.uploads).toEqual([
      { contentType: 'image/jpeg', contentLength: 10, filename: 'beach.jpg' },
    ]);
    expect(server.state.calls).toContain(`PUT ${UPLOAD_URL}`);
  });

  it('puts a photo where it was asked for, after text typed during the upload', async () => {
    serve([makePost('p1', { bodyMarkdown: 'Intro\n\nEnd' })]);
    let pick: (value: unknown) => void = () => {};
    vi.mocked(launchImageLibraryAsync).mockReturnValueOnce(
      new Promise((resolve) => {
        pick = resolve;
      }) as never,
    );
    const renderer = await show(<PostScreen />);
    act(() =>
      input(renderer, 'Body').props.onSelectionChange({
        nativeEvent: { selection: { start: 5, end: 5 } },
      }),
    );
    act(() => {
      void renderer.root
        .findByType('InputAccessoryView' as never)
        .find((node) => node.props.accessibilityLabel === 'Photo')
        .props.onPress();
    });
    act(() =>
      input(renderer, 'Body').props.onChangeText('New start. Intro\n\nEnd'),
    );
    await act(async () =>
      pick({
        canceled: false,
        assets: [
          {
            uri: 'file:///photos/beach.jpg',
            mimeType: 'image/jpeg',
            fileName: 'beach.jpg',
            width: 10,
            height: 10,
          },
        ],
      }),
    );
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')!.bodyMarkdown).toBe(
        'New start. Intro\n\n![beach](/media/upload-1.jpg)\n\nEnd',
      ),
    );
  });

  it('sets tags, excerpt and project in Details', async () => {
    serve(
      [makePost('p1')],
      [makeProject('x', { name: 'Notebook', stage: 'live' })],
    );
    const renderer = await show(<PostScreen />);
    act(() => byLabel(renderer, 'Details').props.onPress());
    await settle(5);
    vi.mocked(Alert.prompt).mockImplementationOnce((_t, _m, callback) =>
      (callback as (v: string) => void)('swift'),
    );
    act(() => byLabel(renderer, 'Add tag').props.onPress());
    act(() => input(renderer, 'Excerpt').props.onChangeText('A short summary'));
    act(() => byLabel(renderer, 'Notebook, Live').props.onPress());
    await vi.waitFor(() =>
      expect(server.state.store.get('p1')).toMatchObject({
        tags: ['swift'],
        excerpt: 'A short summary',
        projectIds: ['x'],
      }),
    );
  });

  it('previews images from the public site from the keyboard toolbar', async () => {
    serve([makePost('p1', { bodyMarkdown: '![x](/media/a.jpg)' })]);
    const renderer = await show(<PostScreen />);
    act(() =>
      renderer.root
        .findByType('InputAccessoryView' as never)
        .find((node) => node.props.accessibilityLabel === 'Preview')
        .props.onPress(),
    );
    const image = renderer.root.find(
      (node) => (node.type as string) === 'Image',
    );
    expect(image.props.source).toEqual({
      uri: 'https://gagnechris.com/media/a.jpg',
    });
  });
});

describe('post edits', () => {
  it('puts an image in its own paragraph', () => {
    expect(insertImage('', { start: 0, end: 0 }, 'a', '/m.jpg')).toEqual({
      text: '![a](/m.jpg)\n\n',
      selection: { start: 14, end: 14 },
    });
    expect(
      insertImage('one\ntwo', { start: 3, end: 3 }, 'a', '/m.jpg').text,
    ).toBe('one\n\n![a](/m.jpg)\n\ntwo');
    expect(
      insertImage('one\n\ntwo', { start: 5, end: 5 }, '[a]', '/m.jpg').text,
    ).toBe('one\n\n![a](/m.jpg)\n\ntwo');
  });

  it('follows a selection through text changed around it', () => {
    const at = { start: 6, end: 9 };
    expect(followSelection('Intro two end', 'Intro two end!', at)).toEqual(at);
    expect(followSelection('Intro two end', 'An Intro two end', at)).toEqual({
      start: 9,
      end: 12,
    });
    expect(followSelection('Intro two end', 'Intro 2 end', at)).toEqual({
      start: 7,
      end: 7,
    });
  });

  it('follows the title with the slug only when asked', () => {
    const draft = {
      title: '',
      slug: 'untitled-abc123',
      excerpt: '',
      bodyMarkdown: '',
      tagsText: '',
      projectIds: [],
      coverImage: '',
      seoTitle: '',
      seoDescription: '',
    };
    expect(withSlugSource(draft, 'title', 'Hi there', true).slug).toBe(
      'hi-there',
    );
    expect(withSlugSource(draft, 'title', 'Hi there', false).slug).toBe(
      'untitled-abc123',
    );
  });
});
