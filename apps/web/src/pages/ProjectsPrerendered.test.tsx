import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ProjectsPrerendered from './ProjectsPrerendered';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:slug" element={<ProjectsPrerendered />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProjectsPrerendered', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('shows the published project page instead of the 404', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          `<!DOCTYPE html><html><body><div id="root"><main class="project-page" data-slug="notebook"><h1>Notebook</h1><div class="project-body"><p>Why.</p></div></main></div></body></html>`,
      }),
    );
    renderAt('/projects/notebook');
    expect(
      await screen.findByRole('heading', { name: 'Notebook' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Why.')).toBeInTheDocument();
    expect(document.title).toBe('Notebook - Chris Gagne');
    expect(fetch).toHaveBeenCalledWith(
      '/projects/notebook/',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    );
  });

  test('a page with no project prerender is the 404', async () => {
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
