import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { renderSiteHeaderHtml } from '@gagnechris/shared/site-chrome';
import { SiteHeader } from './SiteChrome';

vi.mock('@gagnechris/shared/site-config', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SITE_PROJECTS_LIVE: true,
}));

describe('once Projects is live', () => {
  test('the nav and the menu list it, and React still matches the prerender', () => {
    const html = renderSiteHeaderHtml('/projects');
    expect(html.match(/href="\/projects"/g)).toHaveLength(2);
    const template = document.createElement('template');
    template.innerHTML = renderToStaticMarkup(
      <MemoryRouter>
        <SiteHeader current="/projects" />
      </MemoryRouter>,
    );
    template.content
      .querySelectorAll('link[rel="preload"]')
      .forEach((link) => link.remove());
    expect(template.innerHTML).toBe(html);

    render(
      <MemoryRouter>
        <SiteHeader current="/projects" />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Posts', 'Projects', 'Resume', 'Contact']);
  });
});
