import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { accessLevel } from './access';
import type { AuthUser } from './auth/session';
import { WorkspaceFrame, type ShellNavSection } from './WorkspaceShell';

vi.mock('./auth/session', () => ({ signOutUser: vi.fn() }));

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
  { rail = false, path = '/' }: { rail?: boolean; path?: string } = {},
) {
  const user: AuthUser = { label: 'chris@example.com', userId: 'u1', groups };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <WorkspaceFrame
              app="admin"
              user={user}
              sections={SECTIONS}
              rail={rail}
              renderSearch={(close) => (
                <div role="dialog" aria-label="Search">
                  <button type="button" onClick={close}>
                    Close search
                  </button>
                </div>
              )}
            >
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

describe('accessLevel', () => {
  test('names the access each group set gives', () => {
    expect(accessLevel(['site-admin', 'notebook'])).toBe('Full Admin');
    expect(accessLevel(['site-admin'])).toBe('Public CMS');
    expect(accessLevel(['notebook'])).toBe('Notebook only');
    expect(accessLevel([])).toBe('No access');
  });
});
