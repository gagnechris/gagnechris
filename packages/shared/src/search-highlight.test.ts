import { describe, expect, it } from 'vitest';
import {
  highlightParts,
  searchHitDetail,
  wordMatches,
} from './search-highlight.js';

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

describe('searchHitDetail', () => {
  it('is the snippet unless it only repeats the title', () => {
    expect(searchHitDetail({ title: 'Plan', snippet: 'Book the venue' })).toBe(
      'Book the venue',
    );
    expect(searchHitDetail({ title: 'Plan', snippet: 'Plan' })).toBe('');
    expect(searchHitDetail({ title: 'Plan', snippet: '' })).toBe('');
  });
});
