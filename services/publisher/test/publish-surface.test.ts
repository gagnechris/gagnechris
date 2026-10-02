import { describe, expect, it } from 'vitest';
import { publishTargets } from '../src/publish-targets/registry.js';
import {
  STATIC_OPTION_B_PREFIXES,
  allOptionBPrefixes,
  collectAdminMutationPrefixes,
  collectAdminSoftDeletePrefixes,
  collectOptionBPaths,
} from '../src/publish-targets/surface.js';
import nowPageTarget from './fixtures/now-page.target.js';

describe('publish surface collectors (CHR-179)', () => {
  it('collects Option B paths from production targets plus static Vite pages', () => {
    expect(collectOptionBPaths(publishTargets)).toEqual(['/blog', '/resume']);
    expect(allOptionBPrefixes(publishTargets)).toEqual([
      '/blog',
      '/contact',
      '/dont-feed-the-bears',
      '/resume',
    ]);
    expect([...STATIC_OPTION_B_PREFIXES].sort()).toEqual([
      '/contact',
      '/dont-feed-the-bears',
    ]);
  });

  it('includes /now when the now-page fixture is registered', () => {
    const targets = [...publishTargets, nowPageTarget];
    expect(collectOptionBPaths(targets)).toEqual([
      '/blog',
      '/now',
      '/resume',
    ]);
    expect(allOptionBPrefixes(targets)).toContain('/now');
    expect(collectAdminMutationPrefixes(targets)).toEqual([
      '/api/admin/home',
      '/api/admin/now',
      '/api/admin/posts',
      '/api/admin/resume',
    ]);
  });

  it('collects admin soft-delete only for targets that opt in', () => {
    expect(collectAdminSoftDeletePrefixes(publishTargets)).toEqual([
      '/api/admin/posts',
    ]);
    expect(
      collectAdminSoftDeletePrefixes([...publishTargets, nowPageTarget]),
    ).toEqual(['/api/admin/posts']);
  });
});
