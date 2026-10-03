import { isPrivatePath } from './privatePaths';

declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

export const GA_MEASUREMENT_ID = 'G-CDG30T24XY';

/**
 * gtag is only loaded on public pages (spa.html strips it), but never report
 * from /admin or /auth even if it is present (CHR-194).
 */
const canTrack = () =>
  typeof window !== 'undefined' &&
  Boolean(window.gtag) &&
  !isPrivatePath(window.location.pathname);

/**
 * Turns gtag off while a private route is showing, so its own hits
 * (enhanced-measurement outbound clicks, history page views) stop too.
 */
export const setAnalyticsEnabledForPath = (pathname: string) => {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>)[
    `ga-disable-${GA_MEASUREMENT_ID}`
  ] = isPrivatePath(pathname);
};

export const trackPageView = (url: string) => {
  if (isPrivatePath(url) || !canTrack()) return;
  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: url,
  });
};

export const trackEvent = (
  action: string,
  category: string,
  label?: string,
  value?: number,
) => {
  if (canTrack()) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

export const trackResumeView = () => {
  trackEvent('view', 'resume', 'resume_page_view');
};

export const trackResumeDownload = () => {
  trackEvent('download', 'resume', 'resume_download_direct');
};

/** Soft entry sources for Don't Feed the Bears (CHR-94). */
export type BearsGameFrom =
  'resume' | 'contact' | '404' | 'footer' | 'direct' | string;

const trackNamedEvent = (
  name: string,
  params: Record<string, string | number | undefined>,
) => {
  if (canTrack()) {
    window.gtag('event', name, params);
  }
};

export const trackBearsGameStart = (from: BearsGameFrom) => {
  trackNamedEvent('bears_game_start', { from });
};

export const trackBearsGameComplete = (from: BearsGameFrom, score: number) => {
  trackNamedEvent('bears_game_complete', { from, score, value: score });
};

export const trackBearsTipLinkClick = (from: BearsGameFrom) => {
  trackNamedEvent('bears_tip_link_click', { from });
};
