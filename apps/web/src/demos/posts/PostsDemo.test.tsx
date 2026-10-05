import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  renderHomeRecentPostsHtml,
  renderPostPageBodyHtml,
} from '@gagnechris/shared/render';
import PostsDemo from '.';
import {
  POSTS_DEMO_CAPTIONS,
  POSTS_DEMO_NOTE,
  postsDemoReducer,
  postsDemoStatus,
  seedPostsDemo,
  WELCOME_POST,
} from './postsDemoState';

vi.mock('../../kit/markdown/MarkdownEditor', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const AT = '2026-10-04T09:30:00.000Z';

describe('postsDemoReducer', () => {
  test('Draft, then Published, then Unpublished changes; the live copy moves only on Publish', () => {
    let state = seedPostsDemo();
    expect(postsDemoStatus(state)).toBe('draft');
    expect(state.published).toBeNull();

    state = postsDemoReducer(state, { type: 'publish', at: AT });
    expect(postsDemoStatus(state)).toBe('published');
    expect(state.published).toMatchObject({
      title: 'Hello from the demo',
      slug: 'hello-from-the-demo',
      publishedAt: AT,
    });
    const live = state.published;

    state = postsDemoReducer(state, {
      type: 'edit',
      patch: { title: 'Edited title' },
    });
    expect(postsDemoStatus(state)).toBe('unpublished');
    expect(state.published).toBe(live);

    state = postsDemoReducer(state, {
      type: 'publish',
      at: '2026-10-05T00:00:00.000Z',
    });
    expect(postsDemoStatus(state)).toBe('published');
    expect(state.published).toMatchObject({
      title: 'Edited title',
      slug: 'edited-title',
      publishedAt: AT,
    });
  });

  test('editing back to the live copy clears Unpublished changes; an empty title cannot publish', () => {
    let state = postsDemoReducer(seedPostsDemo(), { type: 'publish', at: AT });
    state = postsDemoReducer(state, { type: 'edit', patch: { title: 'X' } });
    state = postsDemoReducer(state, {
      type: 'edit',
      patch: { title: 'Hello from the demo' },
    });
    expect(postsDemoStatus(state)).toBe('published');

    const blank = postsDemoReducer(seedPostsDemo(), {
      type: 'edit',
      patch: { title: '  ' },
    });
    expect(postsDemoReducer(blank, { type: 'publish', at: AT })).toBe(blank);
  });
});

describe('PostsDemo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(AT));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const setup = async () => {
    const user = userEvent.setup();
    render(<PostsDemo />);
    const editor = screen.getByRole('region', { name: 'Editor' });
    const site = screen.getByRole('region', { name: 'Public site' });
    const body = await within(editor).findByRole('textbox', { name: 'Body' });
    const title = within(editor).getByRole('textbox', { name: /^Title/ });
    const page = () => site.querySelector('.posts-demo__html');
    const show = (name: 'Post page' | 'Home') =>
      user.click(within(site).getByRole('button', { name }));
    const publish = (name = 'Publish') =>
      user.click(within(editor).getByRole('button', { name }));
    return { user, editor, site, body, title, page, show, publish };
  };

  test('in Draft the public side shows only what is live and the post page is not there yet', async () => {
    const { editor, site, page, show } = await setup();
    expect(screen.getByText(POSTS_DEMO_NOTE.sideBySide)).toBeInTheDocument();
    expect(screen.getByText(POSTS_DEMO_NOTE.stacked)).toBeInTheDocument();
    expect(within(editor).getByText('draft')).toBeInTheDocument();
    expect(
      within(editor).getByText('/posts/hello-from-the-demo'),
    ).toBeVisible();
    expect(screen.getByText(POSTS_DEMO_CAPTIONS.draft)).toBeInTheDocument();
    const home = document.createElement('div');
    home.innerHTML = renderHomeRecentPostsHtml([WELCOME_POST]);
    expect(page()!.innerHTML).toBe(home.innerHTML);

    await show('Post page');
    expect(page()).toBeNull();
    expect(site).toHaveTextContent(
      'Nothing at /posts/hello-from-the-demo yet. Publish to put it here.',
    );
  });

  test('the post page is the publisher’s sanitised article markup, byte for byte', async () => {
    const { user, body, page, show, publish } = await setup();
    const markdown =
      'Hi <script>alert(1)</script><img src=x onerror="alert(2)">\n\n[x](javascript:alert(3))\n\n## Next';
    await user.clear(body);
    fireEvent.change(body, { target: { value: markdown } });
    await publish();
    await show('Post page');

    const published = document.createElement('div');
    published.innerHTML = renderPostPageBodyHtml({
      slug: 'hello-from-the-demo',
      title: 'Hello from the demo',
      excerpt: '',
      publishedAt: AT,
      bodyMarkdown: markdown,
    });
    expect(page()!.innerHTML).toBe(published.innerHTML);
    const html = page()!.innerHTML;
    expect(html).not.toMatch(/<script|onerror|javascript:/);
    expect(page()!.querySelector('.post-content h2')).toHaveTextContent('Next');
    expect(screen.getByText(POSTS_DEMO_CAPTIONS.published)).toBeInTheDocument();
  });

  test('editing after Publish shows Unpublished changes and the public side keeps the old version until Publish', async () => {
    const { user, editor, site, title, body, page, show, publish } =
      await setup();
    await publish();
    await show('Post page');
    expect(within(site).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Hello from the demo',
    );

    await user.clear(title);
    await user.type(title, 'A better title');
    fireEvent.change(body, { target: { value: 'New body.' } });

    expect(within(editor).getByText('Unpublished changes')).toBeInTheDocument();
    expect(
      screen.getByText(POSTS_DEMO_CAPTIONS.unpublished),
    ).toBeInTheDocument();
    expect(within(editor).getByText('/posts/a-better-title')).toBeVisible();
    expect(within(site).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Hello from the demo',
    );
    expect(page()).not.toHaveTextContent('New body.');
    expect(site).toHaveTextContent('/posts/hello-from-the-demo');
    await show('Home');
    expect(within(site).getByRole('link', { name: 'Hello from the demo' }));
    expect(within(site).queryByRole('link', { name: 'A better title' })).toBe(
      null,
    );

    await publish('Publish changes');
    expect(within(editor).queryByText('Unpublished changes')).toBeNull();
    expect(
      within(editor).getByRole('button', { name: 'Publish' }),
    ).toBeDisabled();
    expect(within(site).getByRole('link', { name: 'A better title' }));
    await show('Post page');
    expect(within(site).getByRole('heading', { level: 1 })).toHaveTextContent(
      'A better title',
    );
    expect(page()).toHaveTextContent('New body.');
  });

  test('Home puts the new post on top, highlighted once, and its link opens the post page in the demo', async () => {
    const { site, page, publish } = await setup();
    await publish();
    const titles = [...site.querySelectorAll('.home-post__title')].map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Hello from the demo', 'Welcome']);
    expect(page()).toHaveAttribute('data-flash');
    // jsdom has no AnimationEvent, so React listens for the prefixed name.
    fireEvent(
      page()!.querySelector('.home-post')!,
      new Event('webkitAnimationEnd', { bubbles: true }),
    );
    expect(page()).not.toHaveAttribute('data-flash');

    const link = within(site).getByRole('link', {
      name: 'Hello from the demo',
    });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(within(site).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Hello from the demo',
    );
    expect(
      within(site).getByRole('button', { name: 'Post page' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('Reset goes back to the seeded draft and keeps focus on Reset', async () => {
    const { user, title, publish } = await setup();
    await publish();
    await user.clear(title);
    await user.type(title, 'Changed');
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue(
      'Hello from the demo',
    );
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText(POSTS_DEMO_CAPTIONS.draft)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveFocus();
  });

  test('makes no network requests', async () => {
    const fetchSpy = vi.fn();
    const open = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(open);
    const { user, title, publish, show } = await setup();
    await publish();
    await user.type(title, '!');
    await publish('Publish changes');
    await show('Post page');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
