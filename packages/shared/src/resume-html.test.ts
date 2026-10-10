import { describe, expect, it } from 'vitest';
import { resumeSummaryExcerpt } from './resume-html.js';

describe('resumeSummaryExcerpt', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    expect(resumeSummaryExcerpt('  one   two  ')).toBe('one two');
    const long = resumeSummaryExcerpt('word '.repeat(80));
    expect(long.length).toBeLessThanOrEqual(201);
    expect(long.endsWith('…')).toBe(true);
  });
});
