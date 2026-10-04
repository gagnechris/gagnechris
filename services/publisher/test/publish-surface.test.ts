import { describe, expect, it } from 'vitest';
import { publishTargets } from '../src/publish-targets/registry.js';
import {
  STATIC_OPTION_B_PAGES,
  allOptionBPages,
  collectAdminMutationPrefixes,
  collectAdminSoftDeletePrefixes,
  collectOptionBPaths,
} from '../src/publish-targets/surface.js';
import nowPageTarget from './fixtures/now-page.target.js';

describe('publish surface collectors', () => {
  it('collects Option B paths from production targets plus static Vite pages', () => {
    expect(collectOptionBPaths(publishTargets)).toEqual([
      '/blog',
      '/projects',
      '/resume',
    ]);
    expect(allOptionBPages(publishTargets)).toEqual([
      '/blog',
      '/contact',
      '/dont-feed-the-bears',
      '/dont-feed-the-bears/camp',
      '/dont-feed-the-bears/wild',
      '/projects',
      '/resume',
    ]);
    expect([...STATIC_OPTION_B_PAGES].sort()).toEqual([
      '/contact',
      '/dont-feed-the-bears',
      '/dont-feed-the-bears/camp',
      '/dont-feed-the-bears/wild',
    ]);
  });

  it('includes /now when the now-page fixture is registered', () => {
    const targets = [...publishTargets, nowPageTarget];
    expect(collectOptionBPaths(targets)).toEqual([
      '/blog',
      '/now',
      '/projects',
      '/resume',
    ]);
    expect(allOptionBPages(targets)).toContain('/now');
    expect(collectAdminMutationPrefixes(targets)).toEqual([
      '/api/admin/home',
      '/api/admin/now',
      '/api/admin/posts',
      '/api/admin/projects',
      '/api/admin/resume',
    ]);
  });

  it('collects admin soft-delete only for targets that opt in', () => {
    expect(collectAdminSoftDeletePrefixes(publishTargets)).toEqual([
      '/api/admin/posts',
      '/api/admin/projects',
    ]);
    expect(
      collectAdminSoftDeletePrefixes([...publishTargets, nowPageTarget]),
    ).toEqual(['/api/admin/posts', '/api/admin/projects']);
  });
});
