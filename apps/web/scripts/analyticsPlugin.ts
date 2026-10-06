import type { HtmlTagDescriptor, Plugin } from 'vite';

const MEASUREMENT_ID = /^G-[A-Z0-9]+$/;

/** Only `scripts/deploy-web.sh` sets `GA_MEASUREMENT_ID`; every other build ships no GA. */
export function gaMeasurementId(raw: string | undefined): string | undefined {
  const id = raw?.trim();
  if (!id) return undefined;
  if (!MEASUREMENT_ID.test(id)) {
    throw new Error(`GA_MEASUREMENT_ID=${id} is not a GA4 measurement ID`);
  }
  return id;
}

// A file rather than an inline script, so the public CSP needs no 'unsafe-inline'.
export const gaBootstrap = (id: string): string =>
  `window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', '${id}');
`;

export const gaTags = (id: string): HtmlTagDescriptor[] => [
  {
    tag: 'script',
    attrs: {
      async: true,
      src: `https://www.googletagmanager.com/gtag/js?id=${id}`,
    },
    injectTo: 'head',
  },
  { tag: 'script', attrs: { defer: true, src: '/ga.js' }, injectTo: 'head' },
];

export function analyticsPlugin(measurementId: string | undefined): Plugin {
  return {
    name: 'analytics',
    apply: 'build',
    transformIndexHtml() {
      return measurementId ? gaTags(measurementId) : [];
    },
    generateBundle() {
      if (!measurementId) return;
      this.emitFile({
        type: 'asset',
        fileName: 'ga.js',
        source: gaBootstrap(measurementId),
      });
    },
  };
}
