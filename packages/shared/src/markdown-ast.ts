import { Lexer, type Token, type Tokens } from 'marked';
import { isSafeLinkHref } from './links.js';
import {
  DROP_CONTENT_TAGS,
  IMAGE_SCHEMES,
  LINK_SCHEMES,
} from './sanitize-policy.js';
import { findTaskEmbeds } from './task-embeds.js';

/**
 * Markdown as plain data for renderers that can't take HTML (React Native).
 * It uses the lexer behind `renderMarkdownToHtml`, so it splits a note into the
 * same blocks the web preview shows. Raw HTML never survives: tags are
 * dropped and their text kept, as the web sanitizer does. Links and images
 * only exist when `isSafeLinkHref` accepts them under the sanitizer's schemes.
 */

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: MarkdownInline[] }
  | { type: 'code'; text: string }
  | {
      type: 'link';
      href: string;
      title: string | null;
      children: MarkdownInline[];
    }
  /** `src` is null when the URL is unsafe; the web sanitizer drops it too. */
  | { type: 'image'; src: string | null; alt: string; title: string | null }
  | { type: 'break' };

export type MarkdownListItem = {
  task: boolean;
  checked: boolean;
  children: MarkdownBlock[];
};

export type MarkdownTableAlign = 'left' | 'center' | 'right' | null;

export type MarkdownBlock =
  | { type: 'heading'; depth: number; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'blockquote'; children: MarkdownBlock[] }
  | {
      type: 'list';
      ordered: boolean;
      start: number;
      loose: boolean;
      items: MarkdownListItem[];
    }
  | { type: 'code'; lang: string | null; text: string }
  | { type: 'hr' }
  | {
      type: 'table';
      align: MarkdownTableAlign[];
      header: MarkdownInline[][];
      rows: MarkdownInline[][][];
    }
  /** A `{{task:<ULID>}}` line; the renderer draws it from the task record. */
  | { type: 'taskEmbed'; id: string; indent: string };

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  sect: '§',
  para: '¶',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  check: '✓',
};

const ENTITY_RE =
  /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([a-zA-Z][\da-zA-Z]*));/g;

/** The text a browser shows for HTML-escaped markdown text; unknown names stay as written. */
export const decodeHtmlEntities = (text: string): string =>
  text.replace(
    ENTITY_RE,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name] ?? whole;
      const code = dec ? Number(dec) : parseInt(hex!, 16);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : '\ufffd';
    },
  );

// Soft line breaks and runs of spaces show as one space in HTML.
const collapse = (text: string): string => text.replace(/[ \t\r\n]+/g, ' ');

const DROP_CONTENT_OPEN = new RegExp(
  String.raw`^<(${DROP_CONTENT_TAGS.join('|')})\b`,
  'i',
);
const DROP_CONTENT_CLOSE = new RegExp(
  String.raw`^</(${DROP_CONTENT_TAGS.join('|')})\s*>`,
  'i',
);
const DROP_CONTENT_ELEMENT = new RegExp(
  String.raw`<(${DROP_CONTENT_TAGS.join('|')})\b[^>]*>[\s\S]*?</\1\s*>`,
  'gi',
);

/** The visible text of a raw HTML block. */
const htmlBlockText = (html: string): string =>
  collapse(
    decodeHtmlEntities(
      html
        .replace(DROP_CONTENT_ELEMENT, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/?[a-zA-Z][^>]*>/g, ' '),
    ),
  ).trim();

const pushText = (out: MarkdownInline[], text: string): void => {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text = collapse(last.text + text);
  else out.push({ type: 'text', text });
};

const safeHref = (raw: string, schemes: readonly string[]): string | null => {
  const href = decodeHtmlEntities(raw);
  return isSafeLinkHref(href, schemes) ? href : null;
};

const inlines = (tokens: readonly Token[] = []): MarkdownInline[] => {
  const out: MarkdownInline[] = [];
  let dropping: string | null = null;
  for (const token of tokens) {
    if (dropping) {
      if (
        token.type === 'html' &&
        DROP_CONTENT_CLOSE.exec(token.text)?.[1]?.toLowerCase() === dropping
      ) {
        dropping = null;
      }
      continue;
    }
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens?.length) {
          for (const child of inlines(t.tokens)) {
            if (child.type === 'text') pushText(out, child.text);
            else out.push(child);
          }
        } else {
          pushText(out, collapse(decodeHtmlEntities(t.text)));
        }
        break;
      }
      case 'escape':
        pushText(out, decodeHtmlEntities((token as Tokens.Escape).text));
        break;
      case 'strong':
      case 'em':
      case 'del':
        out.push({
          type: token.type,
          children: inlines((token as Tokens.Strong).tokens),
        });
        break;
      case 'codespan':
        out.push({ type: 'code', text: (token as Tokens.Codespan).text });
        break;
      case 'br':
        out.push({ type: 'break' });
        break;
      case 'link': {
        const link = token as Tokens.Link;
        const children = inlines(link.tokens);
        const href = safeHref(link.href, LINK_SCHEMES);
        if (href) {
          out.push({
            type: 'link',
            href,
            title: link.title ? decodeHtmlEntities(link.title) : null,
            children,
          });
        } else {
          for (const child of children) {
            if (child.type === 'text') pushText(out, child.text);
            else out.push(child);
          }
        }
        break;
      }
      case 'image': {
        const image = token as Tokens.Image;
        out.push({
          type: 'image',
          src: safeHref(image.href, IMAGE_SCHEMES),
          alt: decodeHtmlEntities(image.text),
          title: image.title ? decodeHtmlEntities(image.title) : null,
        });
        break;
      }
      case 'html': {
        const open = DROP_CONTENT_OPEN.exec((token as Tokens.HTML).text);
        if (open) dropping = open[1]!.toLowerCase();
        break;
      }
      default:
        // `checkbox` (read from the list item) and anything unknown.
        break;
    }
  }
  return out;
};

const trimEdges = (children: MarkdownInline[]): MarkdownInline[] => {
  const first = children[0];
  if (first?.type === 'text') first.text = first.text.replace(/^ +/, '');
  const last = children[children.length - 1];
  if (last?.type === 'text') last.text = last.text.replace(/ +$/, '');
  return children.filter((c) => c.type !== 'text' || c.text !== '');
};

const listItem = (item: Tokens.ListItem): MarkdownListItem => ({
  task: Boolean(item.task),
  checked: Boolean(item.task && item.checked),
  children: blocks(item.tokens),
});

const blocks = (tokens: readonly Token[]): MarkdownBlock[] => {
  const out: MarkdownBlock[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading;
        out.push({
          type: 'heading',
          depth: heading.depth,
          children: trimEdges(inlines(heading.tokens)),
        });
        break;
      }
      case 'paragraph':
      case 'text': {
        const children = trimEdges(
          inlines((token as Tokens.Paragraph).tokens ?? [token]),
        );
        if (children.length) out.push({ type: 'paragraph', children });
        break;
      }
      case 'blockquote':
        out.push({
          type: 'blockquote',
          children: blocks((token as Tokens.Blockquote).tokens),
        });
        break;
      case 'list': {
        const list = token as Tokens.List;
        out.push({
          type: 'list',
          ordered: list.ordered,
          start:
            list.ordered && typeof list.start === 'number' ? list.start : 1,
          loose: list.loose,
          items: list.items.map(listItem),
        });
        break;
      }
      case 'code': {
        const code = token as Tokens.Code;
        const lang = /^\S*/.exec(code.lang ?? '')?.[0] || null;
        out.push({
          type: 'code',
          lang,
          text: code.text.replace(/\n$/, ''),
        });
        break;
      }
      case 'hr':
        out.push({ type: 'hr' });
        break;
      case 'table': {
        const table = token as Tokens.Table;
        out.push({
          type: 'table',
          align: table.align,
          header: table.header.map((cell) => trimEdges(inlines(cell.tokens))),
          rows: table.rows.map((row) =>
            row.map((cell) => trimEdges(inlines(cell.tokens))),
          ),
        });
        break;
      }
      case 'html': {
        const text = htmlBlockText((token as Tokens.HTML).text);
        if (text) {
          out.push({ type: 'paragraph', children: [{ type: 'text', text }] });
        }
        break;
      }
      default:
        // `space`, link definitions, and anything unknown.
        break;
    }
  }
  return out;
};

const lex = (source: string): MarkdownBlock[] =>
  blocks(Lexer.lex(source, { gfm: true, breaks: false }));

/**
 * Embed lines split the body and each side is lexed on its own, the same
 * segments the web preview renders around its live task rows.
 */
export const parseMarkdownBlocks = (source: string): MarkdownBlock[] => {
  const markdown = source ?? '';
  const embeds = findTaskEmbeds(markdown);
  if (embeds.length === 0) return lex(markdown);
  const lines = markdown.split('\n');
  const out: MarkdownBlock[] = [];
  let start = 0;
  for (const embed of embeds) {
    if (embed.line > start) {
      out.push(...lex(lines.slice(start, embed.line).join('\n')));
    }
    out.push({ type: 'taskEmbed', id: embed.id, indent: embed.indent });
    start = embed.line + 1;
  }
  if (start < lines.length) out.push(...lex(lines.slice(start).join('\n')));
  return out;
};
