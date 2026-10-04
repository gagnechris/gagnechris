import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import {
  renderSiteFooterHtml,
  renderSiteHeaderHtml,
  type SiteNavHref,
} from '@gagnechris/shared/site-chrome';
import { routes } from '../routes';
import { trackEvent } from '../utils/analytics';
import { SiteFooter, SiteHeader } from './SiteChrome';

vi.mock('../utils/analytics');

const CURRENT: (SiteNavHref | null)[] = [null, '/posts', '/resume', '/contact'];

/**
 * React's server renderer puts an image preload `<link>` in front of any
 * `<img>`; it isn't part of the component. Re-serializing through the HTML
 * parser also turns React's `<img …/>` into the browser's `<img …>`.
 */
const staticMarkup = (node: React.ReactNode): string => {
  const template = document.createElement('template');
  template.innerHTML = renderToStaticMarkup(
    <MemoryRouter>{node}</MemoryRouter>,
  );
  template.content
    .querySelectorAll('link[rel="preload"][as="image"]')
    .forEach((link) => link.remove());
  return template.innerHTML;
};

const mountedMarkup = (node: React.ReactNode): string =>
  render(<MemoryRouter>{node}</MemoryRouter>).container.innerHTML;

describe('SiteHeader', () => {
  test.each(CURRENT)('matches renderSiteHeaderHtml(%s)', (current) => {
    expect(staticMarkup(<SiteHeader current={current} />)).toBe(
      renderSiteHeaderHtml(current),
    );
    expect(mountedMarkup(<SiteHeader current={current} />)).toBe(
      renderSiteHeaderHtml(current),
    );
  });
});

describe('SiteHeader menu', () => {
  const renderMenu = () => {
    render(
      <MemoryRouter initialEntries={['/posts']}>
        <SiteHeader current="/posts" />
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

describe('SiteFooter', () => {
  test('matches renderSiteFooterHtml for the same year', () => {
    expect(staticMarkup(<SiteFooter year={2031} />)).toBe(
      renderSiteFooterHtml(2031),
    );
    expect(mountedMarkup(<SiteFooter year={2031} />)).toBe(
      renderSiteFooterHtml(2031),
    );
  });

  test('defaults to the current year', () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Chris Gagne`),
    ).toBeInTheDocument();
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
