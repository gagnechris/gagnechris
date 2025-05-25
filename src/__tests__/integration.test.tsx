import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';
import Resume from '../pages/Resume';
import RouteTracker from '../components/RouteTracker';
import * as analytics from '../utils/analytics';

// Mock the analytics module
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
      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );

      // Click LinkedIn link
      const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
      fireEvent.click(linkedInLink);

      expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'linkedin');

      // Click GitHub link
      const githubLink = screen.getByRole('link', { name: 'GitHub' });
      fireEvent.click(githubLink);

      expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'github');
      expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('Page Tracking', () => {
    test('tracks page view on home page', () => {
      render(
        <BrowserRouter>
          <RouteTracker>
            <App />
          </RouteTracker>
        </BrowserRouter>
      );

      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(mockTrackPageView).toHaveBeenCalledWith('/');
    });

    test('tracks page view and resume view on resume page', () => {
      render(
        <BrowserRouter>
          <RouteTracker>
            <Resume />
          </RouteTracker>
        </BrowserRouter>
      );

      expect(screen.getByText('Professional Experience')).toBeInTheDocument();
      expect(mockTrackPageView).toHaveBeenCalledWith('/');
      expect(mockTrackResumeView).toHaveBeenCalled();
    });
  });

  describe('Component Integration', () => {
    test('home page renders correctly with all interactive elements', () => {
      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );

      // Check main content
      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(screen.getByText('About Me')).toBeInTheDocument();
      expect(screen.getByText('Quick Links')).toBeInTheDocument();

      // Check all links are present and clickable
      expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();

      // Verify external links have correct attributes
      const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
      expect(linkedInLink).toHaveAttribute('href', 'https://www.linkedin.com/in/christophergagne/');
      expect(linkedInLink).toHaveAttribute('target', '_blank');

      const githubLink = screen.getByRole('link', { name: 'GitHub' });
      expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris');
      expect(githubLink).toHaveAttribute('target', '_blank');
    });

    test('resume page renders correctly with download functionality', () => {
      render(
        <BrowserRouter>
          <Resume />
        </BrowserRouter>
      );

      // Check main content
      expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
      expect(screen.getByText('Professional Experience')).toBeInTheDocument();
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Core Competencies')).toBeInTheDocument();

      // Check download button is present
      expect(screen.getByRole('button', { name: /download resume as pdf/i })).toBeInTheDocument();

      // Check navigation link
      expect(screen.getByRole('link', { name: 'Back to Home' })).toBeInTheDocument();
    });
  });
});