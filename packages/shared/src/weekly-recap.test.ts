import { describe, expect, it } from 'vitest';
import {
  CreateWeeklyRecapRequestSchema,
  isWeeklyRecapPending,
  weekStartOf,
  WEEKLY_RECAP_PENDING_MARKDOWN,
} from './weekly-recap.js';

const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('weekStartOf', () => {
  it('is the Monday on or before the day', () => {
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26');
    expect(weekStartOf('2026-10-30')).toBe('2026-10-26');
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });
});

describe('isWeeklyRecapPending', () => {
  it('is a recap note whose body is still the placeholder', () => {
    const recap = {
      bodyMarkdown: WEEKLY_RECAP_PENDING_MARKDOWN,
      tags: ['recap'],
    };
    expect(isWeeklyRecapPending(recap)).toBe(true);
    expect(isWeeklyRecapPending({ ...recap, tags: [] })).toBe(false);
    expect(
      isWeeklyRecapPending({ ...recap, bodyMarkdown: '## The week' }),
    ).toBe(false);
  });
});

describe('CreateWeeklyRecapRequestSchema', () => {
  it('takes a week by its Monday', () => {
    expect(
      CreateWeeklyRecapRequestSchema.safeParse({
        id: ID,
        area: 'work',
        weekStart: '2026-10-26',
      }).success,
    ).toBe(true);
    expect(
      CreateWeeklyRecapRequestSchema.safeParse({
        id: ID,
        area: 'work',
        weekStart: '2026-10-27',
      }).success,
    ).toBe(false);
  });
});
