import { trackPageView, trackEvent, trackResumeView, trackResumeDownload } from './analytics';

// Mock window.gtag
const mockGtag = jest.fn();

// Setup global window mock
Object.defineProperty(window, 'gtag', {
  value: mockGtag,
  writable: true,
});

describe('analytics utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure we're in a browser-like environment
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
    test('tracks resume download with default method', () => {
      trackResumeDownload();

      expect(mockGtag).toHaveBeenCalledWith('event', 'download', {
        event_category: 'resume',
        event_label: 'resume_download_direct',
        value: undefined,
      });
    });

    test('tracks resume download with modal method', () => {
      trackResumeDownload('modal');

      expect(mockGtag).toHaveBeenCalledWith('event', 'download', {
        event_category: 'resume',
        event_label: 'resume_download_modal',
        value: undefined,
      });
    });

    test('tracks resume download with direct method', () => {
      trackResumeDownload('direct');

      expect(mockGtag).toHaveBeenCalledWith('event', 'download', {
        event_category: 'resume',
        event_label: 'resume_download_direct',
        value: undefined,
      });
    });
  });

  describe('server-side rendering safety', () => {
    test('does not throw error when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - intentionally setting to undefined for test
      delete global.window;

      expect(() => {
        trackPageView('/test');
        trackEvent('test', 'test');
        trackResumeView();
        trackResumeDownload();
      }).not.toThrow();

      global.window = originalWindow;
    });
  });
});