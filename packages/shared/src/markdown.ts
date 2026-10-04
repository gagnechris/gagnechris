import { Marked, type Token, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { escapeHtml } from './html.js';

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

/** The page title is the h1, so body headings start at h2 and never skip a level. */
const nestHeadings = (tokens: Token[]): void => {
  const headings: Tokens.Heading[] = [];
  markdown.walkTokens(tokens, (token) => {
    if (token.type === 'heading') headings.push(token as Tokens.Heading);
  });
  if (!headings.length) return;
  const shift = Math.min(...headings.map((h) => h.depth)) - 2;
  let previous = 1;
  for (const heading of headings) {
    heading.depth = Math.min(heading.depth - shift, previous + 1, 6);
    previous = heading.depth;
  }
};

/** An image alone in its paragraph with a title (`![alt](src "Caption")`) becomes a captioned figure. */
const captionImages = (tokens: Token[]): Token[] =>
  tokens.map((token) => {
    if (token.type !== 'paragraph') return token;
    const parts = (token as Tokens.Paragraph).tokens.filter(
      (t) => !(t.type === 'text' && !t.raw.trim()),
    );
    const image = parts[0];
    if (parts.length !== 1 || image.type !== 'image' || !image.title) {
      return token;
    }
    const { href, text, title } = image as Tokens.Image;
    const html =
      `<figure><img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">` +
      `<figcaption>${escapeHtml(title!)}</figcaption></figure>`;
    return {
      type: 'html',
      block: true,
      pre: false,
      raw: token.raw,
      text: html,
    };
  });

/**
 * Scrollable boxes must be reachable by keyboard, and a focusable region
 * needs a name. Runs after sanitizing (which strips these attributes), on
 * tags the sanitizer emits without attributes.
 */
const focusableScrollBoxes = (html: string): string => {
  let tables = 0;
  return html
    .replace(/<pre>/g, '<pre tabindex="0">')
    .replace(
      /<table>/g,
      () =>
        `<div class="post-table" role="region" tabindex="0" aria-label="Table ${++tables}"><table>`,
    )
    .replace(/<\/table>/g, '</table></div>');
};

/** Post bodies on the public site; admin previews use `renderMarkdownToHtml`. */
export const renderPostMarkdownToHtml = (source: string): string => {
  const tokens = markdown.lexer(source ?? '');
  nestHeadings(tokens);
  const html = markdown.parser(captionImages(tokens));
  return focusableScrollBoxes(sanitizeRenderedHtml(html));
};
