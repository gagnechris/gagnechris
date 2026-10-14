import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  ACCESS_GROUPS,
  ACCESS_LEVEL_LABELS,
  accessLevelFromGroups,
} from '@gagnechris/shared';
import { accessLevel } from './access';
import type { AuthUser } from './auth/session';
import { WorkspaceFrame, type ShellNavSection } from './WorkspaceShell';

const { openAddPasskey } = vi.hoisted(() => ({ openAddPasskey: vi.fn() }));

vi.mock('./auth/session', () => ({
  canAddPasskey: () => true,
  openAddPasskey,
  signOutUser: vi.fn(),
}));

const SECTIONS: ShellNavSection[] = [
  {
    label: 'Public site',
    items: [
      { to: '/', label: 'Posts', icon: 'posts', end: true },
      { to: '/home', label: 'Home page', tabLabel: 'Home', icon: 'home' },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        to: '/users',
        label: 'Users & access',
        icon: 'users',
        group: 'user-admin',
      },
    ],
  },
];

function renderFrame(
  groups: string[],
  {
    rail = false,
    path = '/',
    app = 'admin',
    collapsible = false,
  }: {
    rail?: boolean;
    path?: string;
    app?: 'admin' | 'notebook';
    collapsible?: boolean;
  } = {},
) {
  const user: AuthUser = { label: 'chris@example.com', userId: 'u1', groups };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <WorkspaceFrame
              app={app}
              user={user}
              sections={SECTIONS}
              rail={rail}
              collapsible={collapsible}
              renderSearch={(close) => (
                <div role="dialog" aria-label="Search">
                  <button type="button" onClick={close}>
                    Close search
                  </button>
                </div>
              )}
            >
              <textarea aria-label="Note" />
              <h1>Page</h1>
            </WorkspaceFrame>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkspaceFrame', () => {
  test('brands the app with its host and marks the current page', () => {
    renderFrame(['site-admin']);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('localhost:5174')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Posts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav).getByRole('link', { name: 'Home page' }),
    ).not.toHaveAttribute('aria-current');
  });

  test('hides group-gated items and Your apps links the user has no group for', () => {
    renderFrame(['site-admin']);
    expect(
      screen.queryByRole('link', { name: 'Users & access' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();

    const apps = screen.getByRole('navigation', { name: 'Your apps' });
    expect(
      within(apps).queryByRole('link', { name: /Notebook/ }),
    ).not.toBeInTheDocument();
    const site = within(apps).getByRole('link', { name: /Public site/ });
    expect(site).toHaveAttribute('href', 'http://localhost:5173/');
    expect(site).toHaveAttribute('target', '_blank');
    expect(site).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('shows the other app and gated items to users in their groups', () => {
    renderFrame(['site-admin', 'notebook', 'user-admin']);
    expect(
      screen.getByRole('link', { name: 'Users & access' }),
    ).toHaveAttribute('href', '/users');
    const apps = screen.getByRole('navigation', { name: 'Your apps' });
    expect(
      within(apps).getByRole('link', { name: /Notebook/ }),
    ).toHaveAttribute('href', 'http://localhost:5175/');
    expect(screen.getByText('Full Admin')).toBeInTheDocument();
  });

  test('⌘K opens search and every nav control is reachable by Tab', async () => {
    const user = userEvent.setup();
    renderFrame(['site-admin']);

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close search' }));

    const reached = new Set<Element>();
    for (let i = 0; i < 12; i++) {
      await user.tab();
      if (document.activeElement) reached.add(document.activeElement);
    }
    for (const name of ['Posts', 'Home page', /Public site/]) {
      expect(reached).toContain(screen.getByRole('link', { name }));
    }
    expect(reached).toContain(
      screen.getByRole('button', { name: 'Search everything' }),
    );
    expect(reached).toContain(
      screen.getByRole('button', { name: 'Sign out of Admin' }),
    );
  });

  test('More opens a sheet with apps and account, and closes on navigation', async () => {
    const user = userEvent.setup();
    renderFrame(['site-admin', 'notebook']);

    await user.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(
      within(sheet).getByRole('link', { name: /Notebook/ }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Sign out of Admin' }),
    ).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole('button', { name: 'Add a passkey' }),
    );
    expect(openAddPasskey).toHaveBeenCalledTimes(1);

    await user.click(
      within(screen.getByRole('navigation', { name: 'Admin' })).getByRole(
        'link',
        { name: 'Home page' },
      ),
    );
    expect(
      screen.queryByRole('dialog', { name: 'More' }),
    ).not.toBeInTheDocument();
  });

  test('More moves focus into the sheet, keeps Tab inside, and Escape returns focus to More', async () => {
    const user = userEvent.setup();
    renderFrame(['site-admin', 'notebook']);
    const more = screen.getByRole('button', { name: 'More' });

    await user.click(more);
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    const search = within(sheet).getByRole('button', {
      name: 'Search everything',
    });
    expect(search).toHaveFocus();
    for (let i = 0; i < 15; i++) {
      await user.tab();
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
    expect(more).toHaveFocus();
  });

  test('the rail keeps every nav item named', () => {
    const { container } = renderFrame(['site-admin'], { rail: true });
    expect(container.firstChild).toHaveClass('workspace--rail');
    expect(screen.getByRole('link', { name: 'Home page' })).toHaveAttribute(
      'title',
      'Home page',
    );
  });
});

describe('collapsible sidebar', () => {
  beforeEach(() => localStorage.clear());

  const shell = (container: HTMLElement) => container.firstChild as Element;
  const sidebarToggle = () => screen.getByRole('button', { name: 'Sidebar' });

  test('the button on the sidebar edge collapses it and the one on the window edge brings it back', async () => {
    const user = userEvent.setup();
    const { container } = renderFrame(['notebook'], {
      app: 'notebook',
      collapsible: true,
    });
    const sidebar = container.querySelector('.workspace-sidebar')!;
    const collapse = sidebarToggle();
    expect(sidebar).toContainElement(collapse);
    expect(
      collapse.closest('.workspace-edge-track')?.previousElementSibling,
    ).toBe(screen.getByRole('separator', { name: 'Resize sidebar' }));
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('title', 'Hide sidebar (⌘\\)');
    expect(collapse).toHaveAttribute('aria-controls', sidebar.id);

    await user.click(collapse);
    expect(shell(container)).toHaveClass('workspace--sidebar-closed');
    const expand = sidebarToggle();
    expect(sidebar).not.toContainElement(expand);
    expect(expand.closest('.workspace-edge-zone')).toHaveClass(
      'workspace-edge-zone--left',
    );
    expect(expand).toHaveFocus();
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveAttribute('aria-controls', sidebar.id);
    expect(expand).toHaveAttribute('title', 'Show sidebar (⌘\\)');

    await user.keyboard('{Enter}');
    expect(shell(container)).not.toHaveClass('workspace--sidebar-closed');
    expect(sidebarToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sidebarToggle()).toHaveFocus();
    expect(container.querySelector('.workspace-edge-zone')).toBeNull();
  });

  test('Tab reaches the sidebar edge button, and ⌘\\ hands focus to the window edge', async () => {
    const user = userEvent.setup();
    renderFrame(['notebook'], { app: 'notebook', collapsible: true });
    screen.getByRole('separator', { name: 'Resize sidebar' }).focus();
    await user.tab();
    expect(sidebarToggle()).toHaveFocus();
    await user.keyboard('{Meta>}\\{/Meta}');
    expect(sidebarToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sidebarToggle()).toHaveFocus();
    await user.keyboard('{Meta>}\\{/Meta}');
    expect(sidebarToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sidebarToggle()).toHaveFocus();
  });

  test('⌘\\ from inside a text field hides and shows the sidebar', async () => {
    const user = userEvent.setup();
    const { container } = renderFrame(['notebook'], {
      app: 'notebook',
      collapsible: true,
    });

    await user.click(screen.getByRole('textbox', { name: 'Note' }));
    await user.keyboard('{Control>}\\{/Control}');
    expect(shell(container)).toHaveClass('workspace--sidebar-closed');
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveFocus();
    await user.keyboard('{Meta>}\\{/Meta}');
    expect(shell(container)).not.toHaveClass('workspace--sidebar-closed');
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveFocus();
    await user.keyboard('{Control>}\\{/Control}');
    expect(shell(container)).toHaveClass('workspace--sidebar-closed');
    // ⌥⌘\\ and ⇧⌘\\ are left for the task panel.
    await user.keyboard('{Meta>}{Alt>}\\{/Alt}{/Meta}');
    await user.keyboard('{Meta>}{Shift>}\\{/Shift}{/Meta}');
    expect(shell(container)).toHaveClass('workspace--sidebar-closed');
  });

  test('a reload keeps the sidebar closed, at its last width', async () => {
    const user = userEvent.setup();
    localStorage.setItem('gagnechris.notebook.sidebarWidth', '300');
    const first = renderFrame(['notebook'], {
      app: 'notebook',
      collapsible: true,
    });
    await user.click(sidebarToggle());
    first.unmount();

    const { container } = renderFrame(['notebook'], {
      app: 'notebook',
      collapsible: true,
    });
    expect(shell(container)).toHaveClass('workspace--sidebar-closed');
    expect(sidebarToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(
      (shell(container) as HTMLElement).style.getPropertyValue(
        '--workspace-sidebar-width',
      ),
    ).toBe('300px');
    await user.click(sidebarToggle());
    expect(shell(container)).not.toHaveClass('workspace--sidebar-closed');
  });

  test('dragging the edge well past the minimum collapses it and keeps the width', () => {
    localStorage.setItem('gagnechris.notebook.sidebarWidth', '240');
    const { container } = renderFrame(['notebook'], {
      app: 'notebook',
      collapsible: true,
    });
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    handle.setPointerCapture = () => {};
    fireEvent.pointerDown(handle, { button: 0, clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1 });
    expect(shell(container)).not.toHaveClass('workspace--sidebar-closed');
    fireEvent.pointerMove(handle, { clientX: 20, pointerId: 1 });
    expect(shell(container)).toHaveClass('workspace--sidebar-closed');
    expect(sidebarToggle()).toHaveFocus();
    expect(localStorage.getItem('gagnechris.notebook.sidebarWidth')).toBe(
      '240',
    );
  });

  test('Admin keeps its sidebar: no toggle, and ⌘\\ does nothing', async () => {
    const user = userEvent.setup();
    const { container } = renderFrame(['site-admin']);
    expect(screen.queryByRole('button', { name: 'Sidebar' })).toBeNull();
    await user.keyboard('{Meta>}\\{/Meta}');
    expect(shell(container)).not.toHaveClass('workspace--sidebar-closed');
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    handle.setPointerCapture = () => {};
    fireEvent.pointerDown(handle, { button: 0, clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    expect(shell(container)).not.toHaveClass('workspace--sidebar-closed');
    expect(localStorage.getItem('gagnechris.admin.sidebar')).toBeNull();
  });
});

describe('accessLevel', () => {
  test('names the access each group set gives', () => {
    expect(accessLevel(['site-admin', 'notebook', 'user-admin'])).toBe(
      'Full Admin',
    );
    expect(accessLevel(['site-admin', 'notebook'])).toBe('Public CMS');
    expect(accessLevel(['site-admin'])).toBe('Public CMS');
    expect(accessLevel(['notebook'])).toBe('Notebook only');
    expect(accessLevel([])).toBe('No access');
  });

  test('matches the level the Users page shows for every group set', () => {
    const sets = ACCESS_GROUPS.reduce<string[][]>(
      (subsets, group) => [...subsets, ...subsets.map((s) => [...s, group])],
      [[]],
    );
    for (const groups of sets) {
      const level = accessLevelFromGroups(groups);
      expect(accessLevel(groups)).toBe(
        level ? ACCESS_LEVEL_LABELS[level] : 'No access',
      );
    }
  });
});
