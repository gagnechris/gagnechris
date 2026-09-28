import { afterEach, describe, expect, it } from 'vitest';
import { formatPostDate, postDateAttribute } from './post-date.js';

const MIDNIGHT_UTC = '2026-02-01T00:00:00.000Z';

describe('formatPostDate', () => {
  const previousTz = process.env.TZ;

  afterEach(() => {
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  });

  it.each(['America/Los_Angeles', 'America/New_York', 'UTC'] as const)(
    'renders midnight UTC as February 1 when process TZ is %s',
    (tz) => {
      process.env.TZ = tz;
      expect(formatPostDate(MIDNIGHT_UTC)).toBe('February 1, 2026');
      expect(postDateAttribute(MIDNIGHT_UTC)).toBe('2026-02-01');
    },
  );

  it('returns empty for nullish input', () => {
    expect(formatPostDate(null)).toBe('');
    expect(formatPostDate(undefined)).toBe('');
    expect(postDateAttribute(null)).toBe('');
  });

  it('returns the raw string when the date is invalid', () => {
    expect(formatPostDate('not-a-date')).toBe('not-a-date');
    expect(postDateAttribute('not-a-date')).toBe('');
  });
});
