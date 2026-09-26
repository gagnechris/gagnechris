import { screen, fireEvent } from '@testing-library/react';
import App from '../App';
import Resume from '../pages/Resume';
import RouteTracker from '../components/RouteTracker';
import { renderWithProviders } from '../test-utils';
import * as analytics from '../utils/analytics';

jest.mock('../utils/analytics');

const mockTrackPageView = jest.mocked(analytics.trackPageView);
const mockTrackEvent = jest.mocked(analytics.trackEvent);
const mockTrackResumeView = jest.mocked(analytics.trackResumeView);

describe('Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('External Link Tracking', () => {
    test('tracks social media link clicks from home page', () => {
      renderWithProviders(<App />);

      const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
      fireEvent.click(linkedInLink);

      expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'linkedin');

      const githubLink = screen.getByRole('link', { name: 'GitHub' });
      fireEvent.click(githubLink);

      expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'github');
      expect(mockTrackEvent).toHaveBeenCalledTimes(2);
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

      expect(screen.getByText('Professional Experience')).toBeInTheDocument();
      expect(mockTrackPageView).toHaveBeenCalledWith('/');
      expect(mockTrackResumeView).toHaveBeenCalled();
    });
  });

  describe('Component Integration', () => {
    test('home page renders correctly with all interactive elements', () => {
      renderWithProviders(<App />);

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(screen.getByText('About Me')).toBeInTheDocument();
      expect(screen.getByText('Quick Links')).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();

      const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
      expect(linkedInLink).toHaveAttribute('href', 'https://www.linkedin.com/in/christophergagne/');
      expect(linkedInLink).toHaveAttribute('target', '_blank');

      const githubLink = screen.getByRole('link', { name: 'GitHub' });
      expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris');
      expect(githubLink).toHaveAttribute('target', '_blank');
    });

    test('resume page renders correctly with download functionality', () => {
      renderWithProviders(<Resume />);

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(screen.getByText('Professional Experience')).toBeInTheDocument();
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Core Competencies')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /download resume as pdf/i })).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'Back to Home' })).toBeInTheDocument();
    });
  });
});
