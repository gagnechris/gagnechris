import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import * as analytics from './utils/analytics';

// Mock the analytics module
jest.mock('./utils/analytics');

const mockTrackEvent = jest.mocked(analytics.trackEvent);

// Wrapper component for router context
const AppWithRouter = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders all main sections', () => {
    render(<AppWithRouter />);
    
    expect(screen.getByText('Chris Gagne')).toBeInTheDocument();
    expect(screen.getByText('About Me')).toBeInTheDocument();
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
  });

  test('tracks LinkedIn link clicks', () => {
    render(<AppWithRouter />);
    
    const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
    fireEvent.click(linkedInLink);
    
    expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'linkedin');
  });

  test('tracks GitHub link clicks', () => {
    render(<AppWithRouter />);
    
    const githubLink = screen.getByRole('link', { name: 'GitHub' });
    fireEvent.click(githubLink);
    
    expect(mockTrackEvent).toHaveBeenCalledWith('click', 'external_link', 'github');
  });

  test('LinkedIn link has correct attributes', () => {
    render(<AppWithRouter />);
    
    const linkedInLink = screen.getByRole('link', { name: 'LinkedIn' });
    expect(linkedInLink).toHaveAttribute('href', 'https://www.linkedin.com/in/christophergagne/');
    expect(linkedInLink).toHaveAttribute('target', '_blank');
    expect(linkedInLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('GitHub link has correct attributes', () => {
    render(<AppWithRouter />);
    
    const githubLink = screen.getByRole('link', { name: 'GitHub' });
    expect(githubLink).toHaveAttribute('href', 'https://github.com/gagnechris');
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});