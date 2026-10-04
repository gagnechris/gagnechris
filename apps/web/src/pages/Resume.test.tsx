import { screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_RESUME,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
} from '@gagnechris/shared/render';
import Resume from './Resume';
import { renderWithProviders } from '../test-utils';
import { trackResumeDownload } from '../utils/analytics';

vi.mock('../utils/analytics');

const stubFetch = (impl: (input: unknown) => Promise<unknown>) =>
  vi.stubGlobal('fetch', vi.fn(impl));

const page = (html: string) => async () => ({
  ok: true,
  text: async () => `<!DOCTYPE html><html><body>${html}</body></html>`,
});

const PUBLISHED = {
  ...DEFAULT_RESUME,
  content: {
    ...DEFAULT_RESUME.content,
    headline: 'Published headline',
    summary: 'Published summary.',
    earlierRolesBefore: 2012,
  },
};

const DEFAULT_SUMMARY_START = DEFAULT_RESUME.content.summary.slice(0, 40);

describe('Resume Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('shows no default content while the published resume loads', () => {
    stubFetch(() => new Promise(() => {}));
    renderWithProviders(<Resume />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Resume' }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(DEFAULT_SUMMARY_START);
    expect(screen.queryByRole('link', { name: 'Download PDF' })).toBeNull();
    expect(document.querySelector('.resume-page')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(fetch).toHaveBeenCalledWith('/resume/', expect.anything());
  });

  test('renders the published page, earlier roles included', async () => {
    stubFetch(page(renderResumePrerenderHtml(PUBLISHED)));
    renderWithProviders(<Resume />);

    expect(await screen.findByText('Published summary.')).toBeInTheDocument();
    expect(screen.getByText('Published headline')).toHaveClass(
      'resume-intro__headline',
    );
    expect(document.body.textContent).not.toContain(DEFAULT_SUMMARY_START);
    const details = document.querySelector('details.resume-earlier__details');
    expect(details?.querySelector('summary')?.textContent).toContain(
      'Earlier roles, 1999–2012',
    );
    expect(details?.textContent).toContain(
      'Developed and maintained applications.',
    );
    expect(document.querySelector('.resume-page')).not.toHaveAttribute(
      'aria-busy',
    );
  });

  test('falls back to the default content when the page cannot load', async () => {
    stubFetch(async () => ({ ok: false, status: 404 }));
    renderWithProviders(<Resume />);

    expect(
      await screen.findByText(DEFAULT_SUMMARY_START, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Experience' }),
    ).toBeInTheDocument();
  });

  test('an unpublished resume says it is available on request, with no download', async () => {
    stubFetch(page(renderResumeUnavailablePrerenderHtml()));
    renderWithProviders(<Resume />);

    expect(
      await screen.findByText('Resume available on request.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download PDF' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  test('Download PDF links to the PDF, tracks, notifies and offers the bears', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');
    stubFetch(async (input) =>
      input === '/resume/'
        ? page(renderResumePrerenderHtml(PUBLISHED))()
        : new Response('{"ok":true}', {
            headers: { 'Content-Type': 'application/json' },
          }),
    );
    renderWithProviders(<Resume />);

    const link = await screen.findByRole('link', { name: 'Download PDF' });
    expect(link).toHaveAttribute('href', '/resume.pdf');
    expect(link).toHaveAttribute('download', 'Chris-Gagne-Resume.pdf');

    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);

    expect(trackResumeDownload).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) => {
          const req = input as Request;
          return (
            req.method === 'POST' &&
            String(req.url).endsWith('/api/resume/download')
          );
        }),
      ).toBe(true),
    );
    expect(
      screen.getByRole('link', { name: /don't feed the bears/i }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=resume');

    fireEvent.click(
      screen.getByRole('button', { name: /dismiss bear game note/i }),
    );
    expect(
      screen.queryByRole('link', { name: /don't feed the bears/i }),
    ).not.toBeInTheDocument();
  });
});
