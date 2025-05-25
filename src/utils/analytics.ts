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
  value?: number
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

export const trackResumeDownload = (method: 'direct' | 'modal' = 'direct') => {
  trackEvent('download', 'resume', `resume_download_${method}`);
};