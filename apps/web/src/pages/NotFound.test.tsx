import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { renderNotFoundBodyHtml } from '@gagnechris/shared/public-pages';
import { renderSitePageHtml } from '@gagnechris/shared/site-chrome';
import { NOT_FOUND_PRERENDER } from '../../scripts/staticPageMeta';
import NotFound from './NotFound';

describe('NotFound', () => {
  test('renders the shared 404 markup', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe(renderNotFoundBodyHtml());
  });

  test('serif heading, one sentence, Home / Posts / Projects / Resume and the bears game', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(
      within(main)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Home', '/'],
      ['Posts', '/posts'],
      ['Projects', '/projects'],
      ['Resume', '/resume'],
      ['Don’t feed the bears', '/dont-feed-the-bears?from=404'],
    ]);
  });
});

describe('the 404 markups', () => {
  const year = new Date().getUTCFullYear();
  const spa = renderSitePageHtml(null, renderNotFoundBodyHtml(), year);

  test('Vite 404.html prerender is the site chrome around the shared body', () => {
    expect(NOT_FOUND_PRERENDER).toBe(
      `<!--prerender:start-->${spa}<!--prerender:end-->`,
    );
  });
});
