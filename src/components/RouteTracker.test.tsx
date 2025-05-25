import { render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import RouteTracker from './RouteTracker';
import * as analytics from '../utils/analytics';

// Mock the analytics module
jest.mock('../utils/analytics');

const mockTrackPageView = jest.mocked(analytics.trackPageView);

describe('RouteTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('tracks page view on initial render', () => {
    render(
      <BrowserRouter>
        <RouteTracker>
          <div>Test content</div>
        </RouteTracker>
      </BrowserRouter>
    );

    expect(mockTrackPageView).toHaveBeenCalledWith('/');
  });

  test('tracks page view for different routes', () => {
    // Test home route
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <RouteTracker>
          <div>Test content</div>
        </RouteTracker>
      </MemoryRouter>
    );

    expect(mockTrackPageView).toHaveBeenCalledWith('/');
    
    unmount();
    jest.clearAllMocks();

    // Test resume route
    render(
      <MemoryRouter initialEntries={['/resume']}>
        <RouteTracker>
          <div>Test content</div>
        </RouteTracker>
      </MemoryRouter>
    );

    expect(mockTrackPageView).toHaveBeenCalledWith('/resume');
  });

  test('renders children correctly', () => {
    const { container } = render(
      <BrowserRouter>
        <RouteTracker>
          <div data-testid="child-content">Test child content</div>
        </RouteTracker>
      </BrowserRouter>
    );

    expect(container.querySelector('[data-testid="child-content"]')).toBeInTheDocument();
  });

  test('tracks different routes correctly', () => {
    const routes = ['/', '/resume', '/about'];
    
    routes.forEach((route) => {
      render(
        <MemoryRouter initialEntries={[route]}>
          <RouteTracker>
            <div>Content for {route}</div>
          </RouteTracker>
        </MemoryRouter>
      );
    });

    routes.forEach((route) => {
      expect(mockTrackPageView).toHaveBeenCalledWith(route);
    });
  });
});