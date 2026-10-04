import { screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../App';
import Resume from '../pages/Resume';
import RouteTracker from '../components/RouteTracker';
import { renderWithProviders } from '../test-utils';
import * as analytics from '../utils/analytics';

vi.mock('../utils/analytics');

const mockTrackPageView = vi.mocked(analytics.trackPageView);
const mockTrackEvent = vi.mocked(analytics.trackEvent);
const mockTrackResumeView = vi.mocked(analytics.trackResumeView);

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('External Link Tracking', () => {
    test('tracks the hero LinkedIn and GitHub link clicks', () => {
      renderWithProviders(<App />);

      fireEvent.click(
        document.querySelector('p.home-hero__links a[href*="linkedin"]')!,
      );
      fireEvent.click(
        document.querySelector('p.home-hero__links a[href*="github.com"]')!,
      );

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'click',
        'external_link',
        'linkedin',
      );
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'click',
        'external_link',
        'github',
      );
    });
  });

  describe('Page Tracking', () => {
    test('tracks page view on home page', () => {
      renderWithProviders(
        <RouteTracker>
          <App />
        </RouteTracker>,
      );

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(mockTrackPageView).toHaveBeenCalledWith('/');
    });

    test('tracks page view and resume view on resume page', () => {
      renderWithProviders(
        <RouteTracker>
          <Resume />
        </RouteTracker>,
      );

      expect(
        screen.getByRole('heading', { level: 1, name: 'Resume' }),
      ).toBeInTheDocument();
      expect(mockTrackPageView).toHaveBeenCalledWith('/');
      expect(mockTrackResumeView).toHaveBeenCalled();
    });
  });

  describe('Component Integration', () => {
    test('home page renders correctly with all interactive elements', () => {
      renderWithProviders(<App />);

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'resume' })).toBeInTheDocument();
      expect(
        screen.getAllByRole('link', { name: 'LinkedIn' }).length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByRole('link', { name: 'GitHub' }).length,
      ).toBeGreaterThanOrEqual(1);

      const linkedInLink = document.querySelector(
        'p.home-hero__links a[href*="linkedin"]',
      )!;
      expect(linkedInLink).toHaveAttribute(
        'href',
        'https://www.linkedin.com/in/christophergagne/',
      );
      expect(linkedInLink).toHaveAttribute('target', '_blank');

      const githubLink = document.querySelector(
        'p.home-hero__links a[href*="github.com"]',
      )!;
      expect(githubLink).toHaveAttribute(
        'href',
        'https://github.com/gagnechris',
      );
      expect(githubLink).toHaveAttribute('target', '_blank');
    });

    test('resume page renders correctly with download functionality', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404 })),
      );
      renderWithProviders(<Resume />);

      expect(
        await screen.findByRole('heading', { name: 'Experience' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Strengths and skills' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Download PDF' }),
      ).toHaveAttribute('href', '/resume.pdf');
      vi.unstubAllGlobals();
    });
  });
});
