import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  projectPageView,
  renderProjectPagePrerenderHtml,
} from '@gagnechris/shared/render';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import ProjectPage from './ProjectPage';

const notebook = SAMPLE_PROJECTS.find((p) => p.slug === 'notebook')!;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:slug" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );

const servePage = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `<!DOCTYPE html><html><body><div id="root">${renderProjectPagePrerenderHtml(
          projectPageView(notebook, [
            {
              id: '01A',
              slug: 'welcome',
              title: 'Welcome',
              publishedAt: '2026-02-01T00:00:00.000Z',
            },
          ]),
        )}</div></body></html>`,
    }),
  );

describe('ProjectPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('client navigation fetches the published page from the same origin', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    servePage();
    renderAt('/projects/notebook');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Notebook' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('region', { name: 'Build log' })
        .querySelector('a[href="/posts/welcome"]'),
    ).not.toBeNull();
    expect(document.title).toBe('Notebook - Chris Gagne');
    expect(fetch).toHaveBeenCalledWith(
      '/projects/notebook/',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    );
  });

  test('a build fetches same-origin even when the local env names a static origin', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', 'http://127.0.0.1:4177');
    servePage();
    renderAt('/projects/notebook');
    await screen.findByRole('heading', { level: 1, name: 'Notebook' });
    expect(fetch).toHaveBeenCalledWith(
      '/projects/notebook/',
      expect.anything(),
    );
  });

  test('the Vite dev server fetches through its /__site proxy', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', 'http://127.0.0.1:4177');
    servePage();
    renderAt('/projects/notebook');
    await screen.findByRole('heading', { level: 1, name: 'Notebook' });
    expect(fetch).toHaveBeenCalledWith(
      '/__site/projects/notebook/',
      expect.anything(),
    );
  });

  test('a slug with no published page is the 404', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, text: async () => '' }),
    );
    renderAt('/projects/missing');
    expect(
      await screen.findByRole('heading', { name: /not found/i }),
    ).toBeInTheDocument();
  });
});
