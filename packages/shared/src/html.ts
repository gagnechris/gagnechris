/**
 * Always pass a replacer function to String.replace so `$` in content is not
 * treated as a replacement pattern.
 */

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);

export const replaceMeta = (
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string => {
  // Match multi-line <meta> tags from the Vite shell.
  const re = new RegExp(
    `<meta\\s[^>]*?${attr}=["']${escapeRegExp(key)}["'][^>]*>`,
    'i',
  );
  const tag = `<meta ${attr}="${key}" content="${content}" />`;
  if (re.test(html)) {
    return html.replace(re, () => tag);
  }
  return upsertMeta(html, attr, key, content);
};

export const upsertMeta = (
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string => {
  const tag = `<meta ${attr}="${key}" content="${content}" />`;
  return html.replace(/<\/head>/i, () => `${tag}\n</head>`);
};

/** The Vite shell already carries a home canonical — replace, never append. */
export const upsertCanonical = (html: string, url: string): string => {
  const tag = `<link rel="canonical" href="${url}" />`;
  const re = /<link\s[^>]*?rel=["']canonical["'][^>]*>/i;
  if (re.test(html)) {
    return html.replace(re, () => tag);
  }
  return html.replace(/<\/head>/i, () => `${tag}</head>`);
};
