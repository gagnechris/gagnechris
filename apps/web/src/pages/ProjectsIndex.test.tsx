import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { renderProjectsIndexPrerenderHtml } from '@gagnechris/public-ui/server';
import ProjectsIndex from './ProjectsIndex';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/projects']}>
      <ProjectsIndex />
    </MemoryRouter>,
  );

const stubFetch = (response: Partial<Response> | Error) =>
  vi.stubGlobal(
    'fetch',
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response),
  );

describe('ProjectsIndex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('lists the published projects from /projects/ on client navigation', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    stubFetch({
      ok: true,
      text: async () =>
        `<!DOCTYPE html><html><body><div id="root">${renderProjectsIndexPrerenderHtml(SAMPLE_PROJECTS)}</div></body></html>`,
    });
    renderPage();
    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /Notebook/ }),
    ).toHaveAttribute('href', '/projects/notebook');
    expect(document.title).toBe('Projects - Chris Gagne');
    expect(fetch).toHaveBeenCalledWith(
      '/projects/',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    );
  });

  test('shows the empty state when nothing is published', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    stubFetch({
      ok: true,
      text: async () =>
        `<div id="root">${renderProjectsIndexPrerenderHtml([])}</div>`,
    });
    renderPage();
    expect(
      await screen.findByText(/The first project is on its way/),
    ).toBeInTheDocument();
  });

  test('says so when the index cannot be loaded', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(new Error('offline'));
    renderPage();
    expect(
      await screen.findByText('Could not load projects.'),
    ).toBeInTheDocument();
  });
});
