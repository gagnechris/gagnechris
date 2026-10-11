import type { BearsGame } from '../games/bears/shared/games';

declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

const canTrack = () => typeof window !== 'undefined' && Boolean(window.gtag);

export const trackPageView = (url: string) => {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!canTrack() || !measurementId) return;
  window.gtag('config', measurementId, {
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

export type BearsGameFrom =
  'resume' | 'contact' | '404' | 'footer' | 'menu' | 'direct' | string;

const trackNamedEvent = (
  name: string,
  params: Record<string, string | number | undefined>,
) => {
  if (canTrack()) {
    window.gtag('event', name, params);
  }
};

const hydrationErrorKind = (error: unknown): string => {
  const message = error instanceof Error ? error.message : '';
  const mismatch =
    /server rendered (HTML|text) didn't match/.exec(message)?.[1] ??
    /^Minified React error #418;.*args\[\]=(HTML|text)/.exec(message)?.[1];
  if (mismatch) return `${mismatch.toLowerCase()}_mismatch`;
  const code = /^Minified React error #(\d+);/.exec(message)?.[1];
  return code ? `react_${code}` : 'other';
};

// React's message can include a diff of the page, so only its kind is sent.
export const trackHydrationError = (path: string, error: unknown) => {
  trackNamedEvent('hydration_error', {
    page_path: path,
    error_kind: hydrationErrorKind(error),
  });
};

export const trackBearsGamePick = (game: BearsGame, from: BearsGameFrom) => {
  trackNamedEvent('bears_game_pick', { game, from });
};

export const trackBearsGameStart = (game: BearsGame, from: BearsGameFrom) => {
  trackNamedEvent('bears_game_start', { game, from });
};

export const trackBearsGameComplete = (
  game: BearsGame,
  from: BearsGameFrom,
  score: number,
) => {
  trackNamedEvent('bears_game_complete', { game, from, score, value: score });
};

/** `game` is undefined for tip links on the landing page. */
export const trackBearsTipLinkClick = (
  from: BearsGameFrom,
  game?: BearsGame,
) => {
  trackNamedEvent('bears_tip_link_click', { game, from });
};
