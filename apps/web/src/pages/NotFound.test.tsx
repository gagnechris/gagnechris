import fs from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { renderNotFoundBodyHtml } from '@gagnechris/shared/public-pages';
import { renderSitePageHtml } from '@gagnechris/shared/site-chrome';
import {
  NOT_FOUND_YEAR_TOKEN,
  renderNotFoundDocumentHtml,
} from '../../scripts/notFoundDocument';
import { NOT_FOUND_PRERENDER } from '../../scripts/staticPageMeta';
import NotFound from './NotFound';

const VIEWER_RESPONSE = path.resolve(
  __dirname,
  '../../../../infra/lib/cloudfront/viewer-response-function.js',
);

type CfResponse = {
  statusCode: number;
  headers: Record<string, { value: string }>;
  body?: string;
};

/** The page CloudFront returns for an S3 403/404. */
const cloudFrontFallback = (): string => {
  const source = fs.readFileSync(VIEWER_RESPONSE, 'utf8');
  const handler = new Function(`${source}\nreturn handler;`)() as (event: {
    request: { uri: string };
    response: CfResponse;
  }) => CfResponse;
  return handler({
    request: { uri: '/posts/missing/index.html' },
    response: {
      statusCode: 403,
      headers: { 'content-type': { value: 'application/xml' } },
      body: '<Error><Code>AccessDenied</Code></Error>',
    },
  }).body!;
};

const parse = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html');

describe('NotFound', () => {
  test('renders the shared 404 markup', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe(renderNotFoundBodyHtml());
  });

  test('serif heading, one sentence, Home / Posts / Resume and the bears game', () => {
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
      ['Resume', '/resume'],
      ['Don’t feed the bears', '/dont-feed-the-bears?from=404'],
    ]);
  });
});

describe('the three 404 markups', () => {
  const year = new Date().getUTCFullYear();
  const spa = renderSitePageHtml(null, renderNotFoundBodyHtml(), year);

  test('Vite 404.html prerender is the site chrome around the shared body', () => {
    expect(NOT_FOUND_PRERENDER).toBe(
      `<!--prerender:start-->${spa}<!--prerender:end-->`,
    );
  });

  test('the CloudFront fallback has the same #root, with this year', () => {
    const doc = parse(cloudFrontFallback());
    expect(doc.getElementById('root')!.innerHTML).toBe(spa);
    expect(doc.title).toBe('Page Not Found - Chris Gagne');
    expect(
      doc.querySelector('meta[name="robots"]')!.getAttribute('content'),
    ).toBe('noindex');
  });

  test('the CloudFront fallback is what the generator writes (npm run not-found:generate)', () => {
    expect(cloudFrontFallback()).toBe(renderNotFoundDocumentHtml(year));
    expect(renderNotFoundDocumentHtml()).toContain(
      `© ${NOT_FOUND_YEAR_TOKEN} Chris Gagne`,
    );
  });

  test('the CloudFront fallback is self-contained: inline styles, no scripts or stylesheets', () => {
    const doc = parse(cloudFrontFallback());
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0);
    const css = doc.querySelector('style')!.textContent!;
    for (const selector of [
      '.site-header',
      '.site-nav__link',
      '.site-footer',
      '.not-found h1',
      '.not-found__text',
      '.not-found__links a',
      '.not-found__bears',
      '#root',
    ]) {
      expect(css).toContain(`${selector}{`);
    }
    expect(css).toContain('url(/fonts/newsreader-roman.woff2)');
    expect(css).not.toMatch(/\.(posts-index|home-page|contact-page)/);
  });
});
