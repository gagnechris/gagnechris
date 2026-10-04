import { afterEach, describe, expect, test, vi } from 'vitest';
import { publicUrl, withPublicUrls } from './publicUrl';

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

describe('withPublicUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('points root-relative links at the public site in a new tab', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    const html = withPublicUrls(
      '<p><a href="/posts">posts</a> <a href="#top">top</a> ' +
        '<a href="https://github.com/x" target="_blank" rel="noopener noreferrer">gh</a> ' +
        '<a href="//cdn.example.com/x">cdn</a></p>',
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    const [posts, top, gh, cdn] = root.querySelectorAll('a');
    expect(posts).toHaveAttribute('href', 'https://gagnechris.com/posts');
    expect(posts).toHaveAttribute('target', '_blank');
    expect(posts).toHaveAttribute('rel', 'noopener noreferrer');
    expect(top).toHaveAttribute('href', '#top');
    expect(top).not.toHaveAttribute('target');
    expect(gh).toHaveAttribute('rel', 'noopener noreferrer');
    expect(cdn).toHaveAttribute('href', '//cdn.example.com/x');
  });

  test('loads root-relative images from the public site', () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    const root = document.createElement('div');
    root.innerHTML = withPublicUrls(
      '<img src="/profile.jpg" alt=""><img src="/media/projects/x.jpg" alt="">' +
        '<img src="data:image/png;base64,AA==" alt=""><img src="//cdn.example.com/x.png" alt="">',
    );
    expect(
      [...root.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    ).toEqual([
      'https://gagnechris.com/profile.jpg',
      'https://gagnechris.com/media/projects/x.jpg',
      'data:image/png;base64,AA==',
      '//cdn.example.com/x.png',
    ]);
  });
});
