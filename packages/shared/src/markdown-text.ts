import { fenceLineKind, scanFences } from './markdown-fences.js';

// ASCII-only line regexes, so the Go port in services/api matches them
// exactly (the contract carries shared cases).
const RULE = /^[ \t]*(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const TABLE_DIVIDER =
  /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/;
const TABLE_ROW = /^[ \t]*\|/;
const LINE_MARKERS =
  /^[ \t]*(?:>[ \t]*)*(?:#{1,6}(?:[ \t]+|$)|(?:[-*+]|\d+[.)])(?:[ \t]+|$)(?:\[[ xX]\](?:[ \t]+|$))?|\[[ xX]\](?:[ \t]+|$))?/;
const IMAGE_OR_LINK = /!?\[([^\]\n]*)\]\([^)\n]*\)/g;
const WIKI_LINK = /\[\[([^\]\n]*)\]\]/g;
const EMPHASIS = /\*\*|__|~~|[*`]/g;

/**
 * Markdown read as prose, line for line: block markers, emphasis and link
 * syntax go; fenced code stays verbatim without its fences.
 */
export function markdownPlainText(markdown: string): string {
  const lines = markdown.split('\n').map((line) => line.replace(/\r$/, ''));
  const fences = scanFences(lines);
  return lines
    .map((line, i) => {
      const kind = fenceLineKind(fences, i);
      if (kind === 'fence') return '';
      if (kind === 'code') return line;
      if (RULE.test(line) || TABLE_DIVIDER.test(line)) return '';
      let text = line.replace(LINE_MARKERS, '');
      if (TABLE_ROW.test(text)) text = text.replace(/\|/g, ' ');
      return text
        .replace(WIKI_LINK, '$1')
        .replace(IMAGE_OR_LINK, '$1')
        .replace(EMPHASIS, '');
    })
    .join('\n');
}
