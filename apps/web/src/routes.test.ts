import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

const leafPath = (pathname: string) => {
  const matches = matchRoutes(routes, pathname) ?? [];
  return matches[matches.length - 1]?.route.path;
};

describe('routes', () => {
  it('matches lowercase admin and auth paths', () => {
    expect(leafPath('/admin/notebook/notes/01J9ZX')).toBe('notes/:id');
    expect(leafPath('/auth/callback')).toBe('auth/callback');
  });

  it('never renders admin or auth for a case variant', () => {
    for (const pathname of [
      '/ADMIN/notebook',
      '/Admin',
      '/aDmIn/notebook/notes/01J9ZX',
      '/AUTH/callback',
      '/Auth/Callback',
    ]) {
      expect(leafPath(pathname)).toBe('*');
    }
  });

  it('keeps public routes case-insensitive', () => {
    expect(leafPath('/Posts/some-slug')).toBe('posts/:slug');
  });
});
