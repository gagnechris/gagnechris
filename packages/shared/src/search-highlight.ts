export type TextRange = { start: number; end: number };

/** The query's words in `text`, case-insensitive, in order. */
export function wordMatches(text: string, q: string): TextRange[] {
  const lower = text.toLowerCase();
  const ranges: TextRange[] = [];
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    for (
      let at = lower.indexOf(word);
      at !== -1;
      at = lower.indexOf(word, at + word.length)
    ) {
      ranges.push({ start: at, end: at + word.length });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** `text` cut at `ranges`; overlapping ranges after the first are skipped. */
export function highlightParts(
  text: string,
  ranges: readonly TextRange[],
): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const m of ranges) {
    if (m.start < cursor) continue;
    if (m.start > cursor) {
      parts.push({ text: text.slice(cursor, m.start), match: false });
    }
    parts.push({ text: text.slice(m.start, m.end), match: true });
    cursor = m.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts;
}
