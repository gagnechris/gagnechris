import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  trackPageView,
  trackEvent,
  trackResumeView,
  trackResumeDownload,
  trackBearsGamePick,
  trackBearsGameStart,
  trackBearsGameComplete,
  trackBearsTipLinkClick,
} from './analytics';

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
      vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
      trackPageView('/test-page');
      vi.unstubAllEnvs();

      expect(mockGtag).toHaveBeenCalledWith('config', 'G-TEST123', {
        page_path: '/test-page',
      });
    });

    test('does not call gtag without a measurement ID', () => {
      vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
      trackPageView('/test-page');
      vi.unstubAllEnvs();

      expect(mockGtag).not.toHaveBeenCalled();
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
    test('tracks bears_game_pick with game and from', () => {
      trackBearsGamePick('wild', 'contact');

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_game_pick', {
        game: 'wild',
        from: 'contact',
      });
    });

    test('tracks bears_game_start with game and from', () => {
      trackBearsGameStart('camp', 'footer');

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_game_start', {
        game: 'camp',
        from: 'footer',
      });
    });

    test('tracks bears_game_complete with game, from, and score', () => {
      trackBearsGameComplete('camp', 'resume', 42);

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_game_complete', {
        game: 'camp',
        from: 'resume',
        score: 42,
        value: 42,
      });
    });

    test('tracks bears_tip_link_click with game and from', () => {
      trackBearsTipLinkClick('404', 'camp');

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_tip_link_click', {
        game: 'camp',
        from: '404',
      });
    });

    test('tracks landing tip link clicks without a game', () => {
      trackBearsTipLinkClick('direct');

      expect(mockGtag).toHaveBeenCalledWith('event', 'bears_tip_link_click', {
        game: undefined,
        from: 'direct',
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
        trackBearsGamePick('camp', 'direct');
        trackBearsGameStart('camp', 'direct');
        trackBearsGameComplete('camp', 'direct', 0);
        trackBearsTipLinkClick('direct');
      }).not.toThrow();

      globalThis.window = originalWindow;
    });
  });
});
