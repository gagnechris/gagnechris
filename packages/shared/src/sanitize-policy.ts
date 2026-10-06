import { POST_LINK_SCHEMES } from './links.js';

/**
 * What rendered markdown may keep, shared by the server sanitizer
 * (sanitize-html) and the browser one (DOMPurify) so both emit the same DOM.
 * No scripts, iframes, event handlers, inline styles, or `javascript:` /
 * `data:` URLs, so pasted HTML can't run in the admin or on published pages.
 */
export const ALLOWED_TAGS: readonly string[] = [
  // sanitize-html's default allowlist
  'address',
  'article',
  'aside',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hgroup',
  'main',
  'nav',
  'section',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'hr',
  'li',
  'menu',
  'ol',
  'p',
  'pre',
  'ul',
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rb',
  'rp',
  'rt',
  'rtc',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
  'caption',
  'col',
  'colgroup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  // markdown output beyond the defaults
  'img',
  'input',
  'del',
];

export const ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ['href', 'title', 'name'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  code: ['class'],
  ol: ['start'],
  th: ['align'],
  td: ['align'],
  input: ['type', 'checked', 'disabled'],
};

export const CODE_CLASS = /^language-[\w-]+$/;

export const LINK_SCHEMES: readonly string[] = POST_LINK_SCHEMES;
export const IMAGE_SCHEMES: readonly string[] = ['http', 'https'];
/** Attributes whose URL scheme is checked. */
export const URL_ATTRIBUTES: readonly string[] = ['href', 'src', 'cite'];

/** Disallowed tags are unwrapped, except these, whose text goes too. */
export const DROP_CONTENT_TAGS: readonly string[] = [
  'script',
  'style',
  'textarea',
  'option',
  'xmp',
];

/** sanitize-html drops these when empty; `alt=""` stays. */
export const NON_EMPTY_ATTRIBUTES: readonly string[] = [
  'href',
  'title',
  'name',
  'src',
  'width',
  'height',
  'class',
  'start',
  'type',
];

/** GFM task lists render `<input type="checkbox" disabled>`; nothing else. */
export const isTaskCheckbox = (type: string | null | undefined): boolean =>
  type === 'checkbox';
