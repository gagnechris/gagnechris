import { describe, expect, it } from 'vitest';
import { adminLinkRoute } from './adminLinks';

describe('admin links', () => {
  it.each([
    ['https://admin.gagnechris.com/posts/01JABC', '/admin/posts/01JABC'],
    [
      'https://admin.gagnechris.com/posts/01JABC/?tab=meta',
      '/admin/posts/01JABC',
    ],
    ['https://admin.gagnechris.com/projects/p1#top', '/admin/projects/p1'],
    ['https://admin.gagnechris.com/projects', '/admin/projects'],
    ['https://admin.gagnechris.com/home', '/admin/pages/home'],
    ['https://admin.gagnechris.com/resume', '/admin/pages/resume'],
    ['https://admin.gagnechris.com/pages', '/admin/pages'],
    ['https://admin.gagnechris.com/settings/users', '/admin/users'],
    ['https://admin.gagnechris.com/', '/admin/posts'],
    ['https://admin.gagnechris.com', '/admin/posts'],
    ['https://admin.gagnechris.com/posts', '/admin/posts'],
  ])('opens %s at %s', (url, route) => {
    expect(adminLinkRoute(url)).toBe(route);
  });

  it('leaves Notebook links and app paths alone', () => {
    expect(adminLinkRoute('https://notebook.gagnechris.com/home')).toBeNull();
    expect(
      adminLinkRoute('https://notebook.gagnechris.com/notes/n1'),
    ).toBeNull();
    expect(adminLinkRoute('/admin/posts/01JABC')).toBeNull();
    expect(adminLinkRoute('gagnechris://auth/callback')).toBeNull();
    expect(
      adminLinkRoute('https://admin.gagnechris.com.evil.test/posts/x'),
    ).toBeNull();
  });
});
