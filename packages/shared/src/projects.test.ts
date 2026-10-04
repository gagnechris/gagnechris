import { describe, expect, it } from 'vitest';
import {
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postPartOfSuffix,
} from './projects.js';

const partOf = (names: string[]) =>
  `${POST_PART_OF_LABEL} ` +
  names.map((n, i) => postPartOfSeparator(i, names.length) + n).join('') +
  postPartOfSuffix(names.length);

describe('Part of wording', () => {
  it('names one project', () => {
    expect(partOf(['Posts'])).toBe('Part of the Posts project');
  });

  it('joins two projects with "and"', () => {
    expect(partOf(['Posts', 'Notebook'])).toBe(
      'Part of the Posts and Notebook projects',
    );
  });

  it('lists three or more with commas and a final "and"', () => {
    expect(partOf(['A', 'B', 'C'])).toBe('Part of the A, B and C projects');
  });
});
