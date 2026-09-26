import { screen, fireEvent } from '@testing-library/react';
import App from './App';
import { renderWithProviders } from './test-utils';
import * as analytics from './utils/analytics';

jest.mock('./utils/analytics');

const mockTrackEvent = jest.mocked(analytics.trackEvent);

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders all main sections', () => {
    renderWithProviders(<App />);

    expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
    expect(screen.getByText('About Me')).toBeInTheDocument();
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
  });

  test('tracks LinkedIn link clicks', () => {
    renderWithProviders(<App />);

    const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
    fireEvent.click(linkedInLink);

    expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'linkedin');
  });

  test('tracks GitHub link clicks', () => {
    renderWithProviders(<App />);

    const githubLink = screen.getByRole('link', { name: 'GitHub' });
    fireEvent.click(githubLink);

    expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'github');
  });

  test('LinkedIn link has correct attributes', () => {
    renderWithProviders(<App />);

    const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
    expect(linkedInLink).toHaveAttribute('href', 'https://www.linkedin.com/in/christophergagne/');
    expect(linkedInLink).toHaveAttribute('target', '_blank');
    expect(linkedInLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('GitHub link has correct attributes', () => {
    renderWithProviders(<App />);

    const githubLink = screen.getByRole('link', { name: 'GitHub' });
    expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris');
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
