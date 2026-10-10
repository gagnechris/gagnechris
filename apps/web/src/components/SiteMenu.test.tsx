import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { PublicLinkContext } from '@gagnechris/public-ui';
import { routes } from '../routes';
import { trackEvent } from '../utils/analytics';
import AppSiteMenu from './SiteMenu';
import SiteLink from './SiteLink';

vi.mock('../utils/analytics');

describe('AppSiteMenu', () => {
  const renderMenu = () => {
    render(
      <MemoryRouter initialEntries={['/posts']}>
        <PublicLinkContext.Provider value={SiteLink}>
          <AppSiteMenu current="/posts" />
        </PublicLinkContext.Provider>
      </MemoryRouter>,
    );
    const button = screen.getByLabelText('Menu', { selector: 'summary' });
    return { button, menu: button.closest('details')! };
  };

  test('the button opens and closes it', () => {
    const { button, menu } = renderMenu();
    expect(button).toHaveAttribute('aria-controls', 'site-menu');
    expect(document.getElementById('site-menu')).not.toBeNull();
    expect(button).not.toHaveAttribute('role');
    expect(button).not.toHaveAttribute('aria-expanded');
    fireEvent.click(button);
    expect(menu.open).toBe(true);
    fireEvent.click(button);
    expect(menu.open).toBe(false);
    expect(button).not.toHaveAttribute('aria-expanded');
  });

  test('following a link closes it', () => {
    const { button, menu } = renderMenu();
    fireEvent.click(button);
    fireEvent.click(
      within(menu).getByRole('link', { name: 'Posts', hidden: true }),
    );
    expect(menu.open).toBe(false);
  });

  test.each([
    ['LinkedIn', 'linkedin'],
    ['GitHub', 'github'],
  ])('%s sends the external link click event', (name, id) => {
    const { button, menu } = renderMenu();
    fireEvent.click(button);
    const link = within(menu).getByRole('link', { name, hidden: true });
    expect(link).toHaveAttribute('target', '_blank');
    fireEvent.click(link);
    expect(trackEvent).toHaveBeenCalledWith('click', 'external_link', id);
  });
});

describe('public layout', () => {
  test.each([
    ['/', null],
    ['/posts', 'Posts'],
    ['/resume', 'Resume'],
    ['/contact', 'Contact'],
    ['/nope', null],
    ['/dont-feed-the-bears/camp', null],
  ] as const)(
    '%s renders inside the site header and footer',
    async (path, current) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise(() => {})),
      );
      render(
        <RouterProvider
          router={createMemoryRouter(routes, { initialEntries: [path] })}
        />,
      );

      const nav = await screen.findByRole('navigation', { name: 'Primary' });
      expect(nav.closest('header')).toHaveClass('site-header');
      expect(screen.getByRole('link', { name: 'Chris Gagne' })).toHaveAttribute(
        'href',
        '/',
      );
      const marked = nav.querySelectorAll('[aria-current="page"]');
      expect([...marked].map((link) => link.textContent)).toEqual(
        current ? [current] : [],
      );
      expect(document.querySelectorAll('footer.site-footer')).toHaveLength(1);
      vi.unstubAllGlobals();
    },
  );
});
