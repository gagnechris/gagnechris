import { Marked, type Token, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { escapeHtml } from './html.js';
import { POST_LINK_SCHEMES } from './links.js';

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
    input: ['type', 'checked', 'disabled', 'aria-label'],
  },
  allowedClasses: {
    code: [/^language-[\w-]+$/],
  },
  allowedSchemes: [...POST_LINK_SCHEMES],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // GFM task lists render `<input type="checkbox" disabled>`; nothing else.
  exclusiveFilter: (frame) =>
    frame.tag === 'input' && frame.attribs.type !== 'checkbox',
  // A checkbox needs a name; the item's text follows it.
  transformTags: {
    input: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, disabled: '', 'aria-label': 'Task' },
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

const LABEL_SEPARATOR = /^\s*(?:[:\u2013\u2014-]\s*)?/;

/** `**Label** value`, alone in its list item; null for anything else. */
const labelRow = (item: Tokens.ListItem): [string, string] | null => {
  const blocks = item.tokens.filter((t) => t.type !== 'space');
  const block = blocks[0];
  if (
    item.task ||
    blocks.length !== 1 ||
    (block?.type !== 'text' && block?.type !== 'paragraph')
  ) {
    return null;
  }
  const { text, tokens = [] } = block as Tokens.Text;
  const label = tokens[0];
  if (label?.type !== 'strong') return null;
  const value = text.slice(label.raw.length).replace(LABEL_SEPARATOR, '');
  if (!value.trim()) return null;
  return [
    markdown.parseInline((label as Tokens.Strong).text) as string,
    markdown.parseInline(value) as string,
  ];
};

/** A bulleted list whose every item starts with a bold label becomes label/value rows. */
const labelRows = (tokens: Token[]): Token[] =>
  tokens.map((token) => {
    if (token.type !== 'list' || (token as Tokens.List).ordered) return token;
    const rows = (token as Tokens.List).items.map(labelRow);
    if (rows.some((row) => row === null)) return token;
    const html =
      '<dl>' +
      (rows as [string, string][])
        .map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`)
        .join('') +
      '</dl>';
    return {
      type: 'html',
      block: true,
      pre: false,
      raw: token.raw,
      text: html,
    };
  });

const renderPublicMarkdown = (
  source: string,
  transform: (tokens: Token[]) => Token[],
): string => {
  const tokens = markdown.lexer(source ?? '');
  nestHeadings(tokens);
  const html = markdown.parser(transform(tokens));
  return focusableScrollBoxes(sanitizeRenderedHtml(html));
};

/** Post bodies on the public site and in the admin post preview. */
export const renderPostMarkdownToHtml = (source: string): string =>
  renderPublicMarkdown(source, captionImages);

/** Project bodies: post rendering plus label/value rows. */
export const renderProjectMarkdownToHtml = (source: string): string =>
  renderPublicMarkdown(source, (tokens) => labelRows(captionImages(tokens)));
