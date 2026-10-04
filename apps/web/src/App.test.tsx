import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHomePrerenderHtml } from '@gagnechris/shared/render';
import App from './App';
import { renderWithProviders } from './test-utils';
import * as analytics from './utils/analytics';

vi.mock('./utils/analytics');

const mockTrackEvent = vi.mocked(analytics.trackEvent);

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal('fetch', vi.fn(impl));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    stubFetch(async () => ({ ok: false, status: 404 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('renders all main sections', () => {
    renderWithProviders(<App />);

    expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
    expect(screen.getByText('About Me')).toBeInTheDocument();
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'LinkedIn' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('link', { name: 'GitHub' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test('falls back to DEFAULT_HOME when nothing is published yet', () => {
    renderWithProviders(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Chris Gagne' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Engineering Leader')).toBeInTheDocument();
    expect(
      screen.getByText(
        /I'm an Engineering Leader at Ro with more than 20 years/,
      ),
    ).toBeInTheDocument();
  });

  test('hydrates header and about copy from the published prerender', async () => {
    stubFetch(async () => ({
      ok: true,
      text: async () =>
        `<!DOCTYPE html><html><body>${renderHomePrerenderHtml({
          name: 'Christopher Gagne',
          title: 'Engineering Director',
          about: 'Published about copy.',
          status: 'published',
          publishedAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
          seo: null,
          version: 2,
          hasUnpublishedChanges: false,
        })}</body></html>`,
    }));

    renderWithProviders(<App />);

    expect(
      await screen.findByText('Published about copy.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Christopher Gagne' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Engineering Director')).toBeInTheDocument();
    // Quick Links are in the prerender and stay after hydrate.
    expect(
      screen.getAllByRole('link', { name: 'LinkedIn' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test('tracks Quick Links LinkedIn and GitHub clicks', () => {
    renderWithProviders(<App />);

    fireEvent.click(
      document.querySelector('#quick-links a[href*="linkedin"]')!,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'click',
      'external_link',
      'linkedin',
    );

    fireEvent.click(
      document.querySelector('#quick-links a[href*="github.com"]')!,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'click',
      'external_link',
      'github',
    );
  });

  test('Quick Links internal routes use SPA Links', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    for (const name of ['Resume', 'Posts', 'Contact'] as const) {
      const link = screen.getByRole('link', { name });
      expect(link.tagName).toBe('A');
      // react-router Link still renders <a>; ensure no target=_blank full reload.
      expect(link).not.toHaveAttribute('target');
      expect(link.getAttribute('href')).toMatch(
        name === 'Resume'
          ? '/resume'
          : name === 'Posts'
            ? '/posts'
            : '/contact',
      );
    }

    await user.click(screen.getByRole('link', { name: 'Resume' }));
    expect(window.location.pathname).toBe('/resume');
  });

  test('LinkedIn link has correct attributes', () => {
    renderWithProviders(<App />);

    const linkedInLink = document.querySelector(
      '#quick-links a[href*="linkedin"]',
    );
    expect(linkedInLink).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/christophergagne/',
    );
    expect(linkedInLink).toHaveAttribute('target', '_blank');
    expect(linkedInLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('GitHub link has correct attributes', () => {
    renderWithProviders(<App />);

    const githubLink = document.querySelector(
      '#quick-links a[href*="github.com"]',
    );
    expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris');
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('leaves the profile photo to the site header', () => {
    const { container } = renderWithProviders(<App />);
    expect(container.querySelector('header.home-header')).toBeTruthy();
    expect(container.querySelector('.home-page img')).toBeNull();
  });
});
