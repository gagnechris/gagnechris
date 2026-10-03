import { describe, expect, test } from 'vitest';
import { navLinkClass } from './navLinkClass';

describe('navLinkClass', () => {
  test('returns active class when active', () => {
    expect(navLinkClass({ isActive: true })).toBe(
      'admin-nav__link admin-nav__link--active',
    );
  });

  test('returns base class when inactive', () => {
    expect(navLinkClass({ isActive: false })).toBe('admin-nav__link');
  });
});
