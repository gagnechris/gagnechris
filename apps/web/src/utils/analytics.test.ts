import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  trackPageView,
  trackEvent,
  trackResumeView,
  trackResumeDownload,
  trackBearsGameStart,
  trackBearsGameComplete,
  trackBearsTipLinkClick,
  setAnalyticsEnabledForPath,
  GA_MEASUREMENT_ID,
} from './analytics';
import { isPrivatePath } from './privatePaths';

const mockGtag = vi.fn();

Object.defineProperty(window, 'gtag', {
  value: mockGtag,
  writable: true,
});

describe('analytics utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'gtag', {
      value: mockGtag,
      writable: true,
    });
  });

  describe('trackPageView', () => {
    test('calls gtag with correct config parameters', () => {
      trackPageView('/test-page');

      expect(mockGtag).toHaveBeenCalledWith('config', 'G-CDG30T24XY', {
        page_path: '/test-page',
      });
    });

    test('does not call gtag when window.gtag is undefined', () => {
      // @ts-expect-error - intentionally setting to undefined for test
      window.gtag = undefined;

      trackPageView('/test-page');

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });

  describe('trackEvent', () => {
    test('calls gtag with all parameters', () => {
      trackEvent('click', 'button', 'header-cta', 1);

      expect(mockGtag).toHaveBeenCalledWith('event', 'click', {
        event_category: 'button',
        event_label: 'header-cta',
        value: 1,
      });
    });

    test('calls gtag with optional parameters undefined', () => {
      trackEvent('click', 'button');

      expect(mockGtag).toHaveBeenCalledWith('event', 'click', {
        event_category: 'button',
        event_label: undefined,
        value: undefined,
      });
    });

    test('does not call gtag when window.gtag is undefined', () => {
      // @ts-expect-error - intentionally setting to undefined for test
      window.gtag = undefined;

      trackEvent('click', 'button', 'test');

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });

  describe('trackResumeView', () => {
    test('tracks resume view event with correct parameters', () => {
      trackResumeView();

      expect(mockGtag).toHaveBeenCalledWith('event', 'view', {
        event_category: 'resume',
        event_label: 'resume_page_view',
        value: undefined,
      });
    });
  });

  describe('trackResumeDownload', () => {
    test('tracks resume download event', () => {
      trackResumeDownload();

      expect(mockGtag).toHaveBeenCalledWith('event', 'download', {
        event_category: 'resume',
        event_label: 'resume_download_direct',
        value: undefined,
      });
    });
  });

  describe('bears game events', () => {
    test('tracks bears_game_start with from', () => {
      trackBearsGameStart('footer');

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_game_start', {
        from: 'footer',
      });
    });

    test('tracks bears_game_complete with from and score', () => {
      trackBearsGameComplete('resume', 42);

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_game_complete', {
        from: 'resume',
        score: 42,
        value: 42,
      });
    });

    test('tracks bears_tip_link_click with from', () => {
      trackBearsTipLinkClick('404');

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_tip_link_click', {
        from: '404',
      });
    });
  });

  describe('server-side rendering safety', () => {
    test('does not throw error when window is undefined', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally setting to undefined for test
      delete globalThis.window;

      expect(() => {
        trackPageView('/test');
        trackEvent('test', 'test');
        trackResumeView();
        trackResumeDownload();
        trackBearsGameStart('direct');
        trackBearsGameComplete('direct', 0);
        trackBearsTipLinkClick('direct');
      }).not.toThrow();

      globalThis.window = originalWindow;
    });
  });

  describe('private routes (CHR-194)', () => {
    const disableKey = `ga-disable-${GA_MEASUREMENT_ID}`;
    const flags = window as unknown as Record<string, unknown>;

    afterEach(() => {
      window.history.replaceState(null, '', '/');
      delete flags[disableKey];
    });

    test('isPrivatePath matches /admin and /auth only', () => {
      for (const path of [
        '/admin',
        '/admin/',
        '/admin/notebook/notes/01J9ZX',
        '/admin?date=2026-10-03',
        '/auth/callback',
      ]) {
        expect(isPrivatePath(path)).toBe(true);
      }
      for (const path of [
        '/',
        '/posts/admin',
        '/administrator',
        '/authors',
        '/resume',
      ]) {
        expect(isPrivatePath(path)).toBe(false);
      }
    });

    test('trackPageView ignores private paths', () => {
      trackPageView('/admin/notebook/notes/01J9ZX');
      trackPageView('/auth/callback');

      expect(mockGtag).not.toHaveBeenCalled();
    });

    test('events are not sent while a private route is showing', () => {
      window.history.replaceState(null, '', '/admin/notebook/today');

      trackPageView('/resume');
      trackEvent('click', 'link');
      trackBearsGameStart('direct');

      expect(mockGtag).not.toHaveBeenCalled();
    });

    test('setAnalyticsEnabledForPath toggles the gtag disable flag', () => {
      setAnalyticsEnabledForPath('/admin/notebook');
      expect(flags[disableKey]).toBe(true);

      setAnalyticsEnabledForPath('/posts');
      expect(flags[disableKey]).toBe(false);
    });
  });
});
