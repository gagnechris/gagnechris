import { matchRoutes, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { adminRoutes } from './admin/routes';
import { notebookRoutes } from './notebook/routes';
import { routes } from './routes';

const leafPath = (table: RouteObject[], pathname: string) => {
  const matches = matchRoutes(table, pathname) ?? [];
  const leaf = matches[matches.length - 1]?.route;
  return leaf?.index ? 'index' : leaf?.path;
};

describe('public routes', () => {
  it('have no admin, Notebook or sign-in routes', () => {
    for (const pathname of [
      '/admin',
      '/admin/notebook/today',
      '/auth/callback',
      '/today',
    ]) {
      expect(leafPath(routes, pathname)).toBe('*');
    }
  });

  it('keep the published /projects pages instead of the 404', () => {
    expect(leafPath(routes, '/projects')).toBe('projects');
    expect(leafPath(routes, '/projects/notebook')).toBe('projects/:slug');
  });

  it('stay case-insensitive', () => {
    expect(leafPath(routes, '/Posts/some-slug')).toBe('posts/:slug');
  });
});

describe('admin routes', () => {
  it('serve the CMS from the host root', () => {
    expect(leafPath(adminRoutes, '/')).toBe('index');
    expect(leafPath(adminRoutes, '/posts/01J9ZX')).toBe('posts/:postId');
    expect(leafPath(adminRoutes, '/home')).toBe('home');
    expect(leafPath(adminRoutes, '/resume')).toBe('resume');
    expect(leafPath(adminRoutes, '/projects')).toBe('projects');
    expect(leafPath(adminRoutes, '/projects/01J9ZX')).toBe(
      'projects/:projectId',
    );
    expect(leafPath(adminRoutes, '/auth/callback')).toBe('auth/callback');
  });

  it('have no Notebook routes', () => {
    expect(leafPath(adminRoutes, '/today')).toBe('*');
    expect(leafPath(adminRoutes, '/notebook/today')).toBe('*');
  });
});

describe('Notebook routes', () => {
  it('serve Notebook pages from the host root', () => {
    expect(leafPath(notebookRoutes, '/')).toBe('index');
    expect(leafPath(notebookRoutes, '/today')).toBe('today');
    expect(leafPath(notebookRoutes, '/notes/01J9ZX')).toBe('notes/:id');
    expect(leafPath(notebookRoutes, '/tasks/01J9ZX')).toBe('tasks/:id');
    expect(leafPath(notebookRoutes, '/auth/callback')).toBe('auth/callback');
  });

  it('have no CMS routes', () => {
    expect(leafPath(notebookRoutes, '/posts/01J9ZX')).toBe('*');
    expect(leafPath(notebookRoutes, '/resume')).toBe('*');
  });
});
