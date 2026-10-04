import { afterEach, describe, expect, test, vi } from 'vitest';
import { publicUrl, withPublicLinks } from './publicUrl';

describe('publicUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('resolves against the public dev origin by default', () => {
    expect(publicUrl('/posts/hello')).toBe('http://localhost:5173/posts/hello');
  });

  test('resolves against the configured public origin', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    expect(publicUrl('/')).toBe('https://gagnechris.com/');
    expect(publicUrl('/resume')).toBe('https://gagnechris.com/resume');
  });

  test('leaves absolute URLs alone', () => {
    expect(publicUrl('https://example.com/x')).toBe('https://example.com/x');
  });
});

describe('withPublicLinks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('points root-relative links at the public site in a new tab', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    const html = withPublicLinks(
      '<p><a href="/posts">posts</a> <a href="#top">top</a> ' +
        '<a href="https://github.com/x" target="_blank" rel="noopener noreferrer">gh</a> ' +
        '<a href="//cdn.example.com/x">cdn</a></p>',
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    const [posts, top, gh, cdn] = root.querySelectorAll('a');
    expect(posts).toHaveAttribute('href', 'https://gagnechris.com/posts');
    expect(posts).toHaveAttribute('target', '_blank');
    expect(posts).toHaveAttribute('rel', 'noopener');
    expect(top).toHaveAttribute('href', '#top');
    expect(top).not.toHaveAttribute('target');
    expect(gh).toHaveAttribute('rel', 'noopener noreferrer');
    expect(cdn).toHaveAttribute('href', '//cdn.example.com/x');
  });
});
