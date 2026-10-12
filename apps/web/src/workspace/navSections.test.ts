import { describe, expect, test } from 'vitest';
import { navPages } from './navSections';
import type { ShellNavSection } from './WorkspaceShell';

const sections: ShellNavSection[] = [
  {
    label: 'Site',
    items: [
      {
        to: '/pages',
        label: 'Pages',
        icon: 'pages',
        childPages: [{ to: '/home', label: 'Home page' }],
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/users', label: 'Users', icon: 'users', group: 'user-admin' },
    ],
  },
];

describe('navPages', () => {
  test('lists items and their child pages the groups can see', () => {
    expect(navPages(sections, ['user-admin'])).toEqual([
      { to: '/pages', title: 'Pages' },
      { to: '/home', title: 'Home page' },
      { to: '/users', title: 'Users' },
    ]);
    expect(navPages(sections, []).map((p) => p.title)).toEqual([
      'Pages',
      'Home page',
    ]);
  });
});
