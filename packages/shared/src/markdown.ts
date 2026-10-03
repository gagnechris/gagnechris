import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * A local instance (no global `marked.setOptions`) keeps this module free of
 * import side effects, so public pages that only use other render helpers
 * don't bundle marked or the sanitizer.
 */
const markdown = /* @__PURE__ */ new Marked({ gfm: true, breaks: false });

/**
 * No scripts, iframes, event handlers, inline styles, or `javascript:` /
 * `data:` URLs, so pasted HTML can't run in the admin or on published pages.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'h1',
    'h2',
    'input',
    'del',
    's',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'name'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    ol: ['start'],
    th: ['align'],
    td: ['align'],
    input: ['type', 'checked', 'disabled'],
  },
  allowedClasses: {
    code: [/^language-[\w-]+$/],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // GFM task lists render `<input type="checkbox" disabled>`; nothing else.
  exclusiveFilter: (frame) =>
    frame.tag === 'input' && frame.attribs.type !== 'checkbox',
  transformTags: {
    input: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, disabled: '' },
    }),
  },
};

export const sanitizeRenderedHtml = (html: string): string =>
  sanitizeHtml(html, SANITIZE_OPTIONS);

export const renderMarkdownToHtml = (source: string): string => {
  const html = markdown.parse(source ?? '', { async: false }) as string;
  return sanitizeRenderedHtml(html);
};
