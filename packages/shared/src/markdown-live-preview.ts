import { findBareUrls, linkHref } from './links.js';
import { fenceLineKind, scanFences } from './markdown-fences.js';
import { parseTaskEmbedLine } from './task-embeds.js';

const HEADING = /^(#{1,6})([ \t]+)/;
const QUOTE = /^([ \t]{0,3}>[ \t]?)/;
const BULLET = /^([ \t]*)([-*+])([ \t]+)(?!\[[ xX]\])/;
const CODE_SPAN = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
// One level of balanced parentheses in the URL, as in Wikipedia links.
const LINK =
  /(?<!!)\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:[ \t]+"[^"\n]*")?\)/g;
const STRONG = /(\*\*|__)(?=\S)([^\n]*?\S)\1/g;
const EMPHASIS = /(?<![*_\w])([*_])(?=[^\s*_])([^\n*_]*?[^\s*_])\1(?![*_\w])/g;

/** `![alt](src "title")`, the image syntax the editors render as widgets. */
export const MARKDOWN_IMAGE =
  /!\[([^\]\n]*)\]\(([^)\s]+)(?:[ \t]+"[^"\n]*")?\)/g;
const STANDALONE_IMAGE = new RegExp(`^[ \\t]*${MARKDOWN_IMAGE.source}[ \\t]*$`);

export type LiveLineStyle =
  'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'fence' | 'code';

/**
 * `hide` is syntax to hide, `bullet` a list marker shown as •, the rest
 * styled text. Offsets are within the line.
 */
export type LiveMark = {
  from: number;
  to: number;
  kind: 'hide' | 'bullet' | 'strong' | 'em' | 'code' | 'link';
  href?: string;
};

export type LiveImage = { from: number; to: number; src: string; alt: string };

/**
 * How one line renders in a live-preview editor. `style` applies on every
 * line; `marks` only on lines the selection doesn't touch, where the
 * markdown syntax is hidden.
 */
export type LiveLine = {
  style: LiveLineStyle | null;
  marks: LiveMark[];
  /** A line holding only an image, which renders as the image. */
  image?: LiveImage;
};

type Span = { from: number; to: number };

const overlaps = (taken: Span[], from: number, to: number) =>
  taken.some((s) => from < s.to && to > s.from);

function inlineMarks(text: string, offset: number, out: LiveMark[]) {
  const taken: Span[] = [];
  for (const m of text.matchAll(CODE_SPAN)) {
    const from = m.index;
    const to = from + m[0].length;
    const tick = m[1]!.length;
    taken.push({ from, to });
    out.push(
      { from: offset + from, to: offset + from + tick, kind: 'hide' },
      { from: offset + from + tick, to: offset + to - tick, kind: 'code' },
      { from: offset + to - tick, to: offset + to, kind: 'hide' },
    );
  }
  for (const m of text.matchAll(LINK)) {
    const from = m.index;
    const to = from + m[0].length;
    if (overlaps(taken, from, to)) continue;
    taken.push({ from, to });
    const labelEnd = from + 1 + m[1]!.length;
    out.push(
      { from: offset + from, to: offset + from + 1, kind: 'hide' },
      {
        from: offset + from + 1,
        to: offset + labelEnd,
        kind: 'link',
        href: linkHref(m[2]!),
      },
      { from: offset + labelEnd, to: offset + to, kind: 'hide' },
    );
  }
  for (const { from, to, href } of findBareUrls(text)) {
    if (overlaps(taken, from, to)) continue;
    taken.push({ from, to });
    out.push({ from: offset + from, to: offset + to, kind: 'link', href });
  }
  for (const [pattern, kind] of [
    [STRONG, 'strong'],
    [EMPHASIS, 'em'],
  ] as const) {
    for (const m of text.matchAll(pattern)) {
      const from = m.index;
      const to = from + m[0].length;
      const marker = m[1]!.length;
      if (
        overlaps(taken, from, from + marker) ||
        overlaps(taken, to - marker, to)
      ) {
        continue;
      }
      taken.push({ from, to: from + marker }, { from: to - marker, to });
      out.push(
        { from: offset + from, to: offset + from + marker, kind: 'hide' },
        { from: offset + from + marker, to: offset + to - marker, kind },
        { from: offset + to - marker, to: offset + to, kind: 'hide' },
      );
    }
  }
}

/** A line outside any fence. Line-based, with no markdown parser. */
export function liveMarkdownLine(text: string): LiveLine {
  const marks: LiveMark[] = [];
  let style: LiveLineStyle | null = null;
  let bodyStart = 0;
  const heading = HEADING.exec(text);
  if (heading) {
    style = `h${heading[1]!.length}` as LiveLineStyle;
    bodyStart = heading[0].length;
    marks.push({ from: 0, to: bodyStart, kind: 'hide' });
  } else {
    const quote = QUOTE.exec(text);
    if (quote) {
      style = 'quote';
      bodyStart = quote[0].length;
      marks.push({ from: 0, to: bodyStart, kind: 'hide' });
    }
    const item = BULLET.exec(text.slice(bodyStart));
    if (item) {
      const at = bodyStart + item[1]!.length;
      marks.push({ from: at, to: at + 1, kind: 'bullet' });
    }
  }
  inlineMarks(text.slice(bodyStart), bodyStart, marks);
  return { style, marks };
}

/** The image a line holds when it holds nothing else. */
export function standaloneMarkdownImage(text: string): LiveImage | null {
  const m = STANDALONE_IMAGE.exec(text);
  if (!m) return null;
  const from = text.indexOf('![');
  const to = text.trimEnd().length;
  return { from, to, src: m[2]!, alt: m[1]! };
}

/** Every line of `markdown`; task embed lines are left plain. */
export function liveMarkdownLines(
  markdown: string,
  { images = false }: { images?: boolean } = {},
): LiveLine[] {
  const lines = markdown.split('\n');
  const fences = scanFences(lines);
  return lines.map((text, n) => {
    const fenced = fenceLineKind(fences, n);
    if (fenced) return { style: fenced, marks: [] };
    if (parseTaskEmbedLine(text)) return { style: null, marks: [] };
    const image = images ? standaloneMarkdownImage(text) : null;
    if (image) return { style: null, marks: [], image };
    return liveMarkdownLine(text);
  });
}
