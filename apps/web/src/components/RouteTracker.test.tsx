import { render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import RouteTracker from './RouteTracker';
import * as analytics from '../utils/analytics';

vi.mock('../utils/analytics');

const mockTrackPageView = vi.mocked(analytics.trackPageView);
const mockSetEnabled = vi.mocked(analytics.setAnalyticsEnabledForPath);

describe('RouteTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('tracks page view on initial render', () => {
    render(
      <BrowserRouter>
        <RouteTracker>
          <div>Test content</div>
        </RouteTracker>
      </BrowserRouter>,
    );

    expect(mockTrackPageView).toHaveBeenCalledWith('/');
  });

  test('tracks page view for different routes', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <RouteTracker>
          <div>Test content</div>
        </RouteTracker>
      </MemoryRouter>,
    );

    expect(mockTrackPageView).toHaveBeenCalledWith('/');

    unmount();
    vi.clearAllMocks();

    render(
      <MemoryRouter initialEntries={['/resume']}>
        <RouteTracker>
          <div>Test content</div>
        </RouteTracker>
      </MemoryRouter>,
    );

    expect(mockTrackPageView).toHaveBeenCalledWith('/resume');
  });

  test('renders children correctly', () => {
    const { container } = render(
      <BrowserRouter>
        <RouteTracker>
          <div data-testid="child-content">Test child content</div>
        </RouteTracker>
      </BrowserRouter>,
    );

    expect(
      container.querySelector('[data-testid="child-content"]'),
    ).toBeInTheDocument();
  });

  test('tracks different routes correctly', () => {
    const routes = ['/', '/resume', '/about'];

    routes.forEach((route) => {
      render(
        <MemoryRouter initialEntries={[route]}>
          <RouteTracker>
            <div>Content for {route}</div>
          </RouteTracker>
        </MemoryRouter>,
      );
    });

    routes.forEach((route) => {
      expect(mockTrackPageView).toHaveBeenCalledWith(route);
    });
  });

  test('passes private routes to the analytics guard (CHR-194)', () => {
    render(
      <MemoryRouter initialEntries={['/admin/notebook/today']}>
        <RouteTracker>
          <div>Admin</div>
        </RouteTracker>
      </MemoryRouter>,
    );

    expect(mockSetEnabled).toHaveBeenCalledWith('/admin/notebook/today');
  });
});
