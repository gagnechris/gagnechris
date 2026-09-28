declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

export const trackPageView = (url: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'G-CDG30T24XY', {
      page_path: url,
    });
  }
};

export const trackEvent = (
  action: string,
  category: string,
  label?: string,
  value?: number,
) => {
  if (typeof window !== 'undefined' && window.gtag) {
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
  if (typeof window !== 'undefined' && window.gtag) {
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
