import baseCss from '../../index.css?inline';
import siteCss from '../../public.css?inline';

// The admin host has no /fonts (its public dir is public-admin), so the
// preview loads the same files as bundled assets.
const fontUrls = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../../public/fonts/*.woff2', {
      query: '?url',
      import: 'default',
      eager: true,
    }),
  ).map(([file, url]) => [`/fonts/${file.split('/').pop()!}`, url]),
);

const withBundledFonts = (css: string): string =>
  css.replace(
    /url\((['"]?)(\/fonts\/[^'")]+)\1\)/g,
    (match, _quote: string, path: string) =>
      fontUrls[path] ? `url('${fontUrls[path]}')` : match,
  );

// The page is not in a viewport-tall #root here: the frame sizes to it.
const PREVIEW_CSS = 'body, #root { min-height: 0; }';

/** The public site's styles for a page whose own stylesheet is `pageCss`. */
export const publicPageStyles = (...pageCss: string[]): string =>
  [baseCss, withBundledFonts(siteCss), ...pageCss, PREVIEW_CSS].join('\n');
