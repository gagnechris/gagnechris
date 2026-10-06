declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

export const GA_MEASUREMENT_ID = 'G-CDG30T24XY';

const canTrack = () => typeof window !== 'undefined' && Boolean(window.gtag);

export const trackPageView = (url: string) => {
  if (!canTrack()) return;
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

export type BearsGame = 'camp' | 'wild';

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
