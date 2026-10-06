import DOMPurify from 'dompurify';
import {
  ALLOWED_ATTRIBUTES,
  ALLOWED_TAGS,
  CODE_CLASS,
  DROP_CONTENT_TAGS,
  IMAGE_SCHEMES,
  isTaskCheckbox,
  LINK_SCHEMES,
  NON_EMPTY_ATTRIBUTES,
  URL_ATTRIBUTES,
} from './sanitize-policy.js';

// sanitize-html's URL check (launder's naughtyHref), so both sanitizers keep
// and drop the same links.
const SCHEME = /^([a-zA-Z][a-zA-Z0-9.\-+]*):/;
// eslint-disable-next-line no-control-regex
const IGNORED_URL_CHARS = /[\x00-\x20]+/g;

const isAllowedUrl = (value: string, schemes: readonly string[]): boolean => {
  let href = value.replace(IGNORED_URL_CHARS, '');
  for (;;) {
    const open = href.indexOf('<!--');
    if (open === -1) break;
    const close = href.indexOf('-->', open + 4);
    if (close === -1) break;
    href = href.slice(0, open) + href.slice(close + 3);
  }
  const match = SCHEME.exec(href);
  if (!match) return !/^[/\\]{2}/.test(href);
  return schemes.includes(match[1]!.toLowerCase());
};

const ALL_ATTRIBUTES = [...new Set(Object.values(ALLOWED_ATTRIBUTES).flat())];

let purify: ReturnType<typeof DOMPurify> | undefined;

const instance = () => {
  if (purify) return purify;
  purify = DOMPurify();
  purify.addHook('uponSanitizeElement', (node, data) => {
    if (
      data.tagName === 'input' &&
      !isTaskCheckbox((node as Element).getAttribute('type'))
    ) {
      node.parentNode?.removeChild(node);
    }
  });
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    const tag = node.nodeName.toLowerCase();
    const name = data.attrName;
    // Untrimmed, as sanitize-html sees it.
    let value = (node as Element).getAttribute(name) ?? data.attrValue;
    data.attrValue = value;
    if (!ALLOWED_ATTRIBUTES[tag]?.includes(name)) {
      data.keepAttr = false;
      return;
    }
    if (name === 'class') {
      value = value
        .split(/\s+/)
        .filter((c) => CODE_CLASS.test(c))
        .join(' ');
      data.attrValue = value;
    }
    if (value === '' && NON_EMPTY_ATTRIBUTES.includes(name)) {
      data.keepAttr = false;
      return;
    }
    if (
      URL_ATTRIBUTES.includes(name) &&
      !isAllowedUrl(value, tag === 'img' ? IMAGE_SCHEMES : LINK_SCHEMES)
    ) {
      data.keepAttr = false;
    }
  });
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'INPUT') node.setAttribute('disabled', '');
  });
  return purify;
};

/**
 * DOMPurify with the server's allowlist: the admin preview renders pasted HTML
 * on the origin that holds the session, and sanitize-html (with postcss)
 * is too heavy to ship to the browser.
 */
export const sanitizeRenderedHtml = (html: string): string =>
  instance().sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: ALL_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_CONTENTS: [...DROP_CONTENT_TAGS],
    // The scheme check in the attribute hook is the URL policy.
    ALLOWED_URI_REGEXP: /(?:)/,
    // Only <a> may carry `name`, and anchors don't clobber document properties.
    SANITIZE_DOM: false,
  });
