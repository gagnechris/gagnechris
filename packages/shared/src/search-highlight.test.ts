import { describe, expect, it } from 'vitest';
import { highlightParts, wordMatches } from './search-highlight.js';

describe('search highlight', () => {
  it('finds every query word, in order', () => {
    expect(wordMatches('Call Sam, then call Ana', 'call ana')).toEqual([
      { start: 0, end: 4 },
      { start: 15, end: 19 },
      { start: 20, end: 23 },
    ]);
  });

  it('cuts text at the ranges and skips overlaps', () => {
    expect(
      highlightParts('renew passport', [
        { start: 0, end: 5 },
        { start: 2, end: 4 },
        { start: 6, end: 10 },
      ]),
    ).toEqual([
      { text: 'renew', match: true },
      { text: ' ', match: false },
      { text: 'pass', match: true },
      { text: 'port', match: false },
    ]);
    expect(highlightParts('plain', [])).toEqual([
      { text: 'plain', match: false },
    ]);
  });
});
