import { describe, expect, it } from 'vitest';
import { markdownPlainText } from './markdown-text.js';

describe('markdownPlainText', () => {
  it('drops block markers, emphasis and link syntax', () => {
    expect(
      markdownPlainText(
        '## Focus\nPrep for the **roadmap** review. See [[Project notes]].\n- [ ] Review the [Q4 plan](https://example.com)\n> ~~old~~ `idea`',
      ),
    ).toBe(
      'Focus\nPrep for the roadmap review. See Project notes.\nReview the Q4 plan\nold idea',
    );
  });

  it('keeps fenced code verbatim, without its fences', () => {
    expect(markdownPlainText('```\n## **as is**\n```\nafter')).toBe(
      '\n## **as is**\n\nafter',
    );
  });

  it('drops rules and table dividers, and table pipes', () => {
    expect(markdownPlainText('---\n| A | B |\n|---|---|\nsnake_case')).toBe(
      '\n  A   B  \n\nsnake_case',
    );
  });
});
