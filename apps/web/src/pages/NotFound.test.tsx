import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { renderNotFoundPageHtml } from '@gagnechris/public-ui/server';
import { NOT_FOUND_PRERENDER } from '../../scripts/staticPageMeta';
import NotFound from './NotFound';

describe('NotFound', () => {
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

test('Vite 404.html prerender is the public-ui 404 page', () => {
  expect(NOT_FOUND_PRERENDER).toBe(
    `<!--prerender:start-->${renderNotFoundPageHtml()}<!--prerender:end-->`,
  );
});
