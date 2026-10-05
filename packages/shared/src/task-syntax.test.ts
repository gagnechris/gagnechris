import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  activeTaskDateQuery,
  formatTaskDay,
  localDateString,
  parseTaskSyntax,
  taskDateMenuOptions,
  taskDateToken,
} from './task-syntax.js';

// 2026-10-02 is a Friday, 2026-10-05 a Monday.
const FRI = '2026-10-02';

const dated = (title: string, startDate: string, priority = 'med') => ({
  title,
  startDate,
  someday: false,
  priority,
});

const undated = (title: string, priority = 'med') => ({
  title,
  startDate: null,
  someday: false,
  priority,
});

describe('parseTaskSyntax tokens', () => {
  it.each([
    ['Ship it @today', dated('Ship it', FRI)],
    ['Ship it @tomorrow', dated('Ship it', '2026-10-03')],
    ['Ship it @next week', dated('Ship it', '2026-10-05')],
    ['Ship it @oct 12', dated('Ship it', '2026-10-12')],
    ['Ship it @october 12', dated('Ship it', '2026-10-12')],
    ['Ship it @2026-11-30', dated('Ship it', '2026-11-30')],
    ['Ship it !high', undated('Ship it', 'high')],
    ['Ship it !low', undated('Ship it', 'low')],
    ['Ship it !med', undated('Ship it')],
  ])('%s', (input, expected) => {
    expect(parseTaskSyntax(input, FRI)).toEqual(expected);
  });

  it('@someday parks the task with no date', () => {
    expect(parseTaskSyntax('Try Expo Router @someday', FRI)).toEqual({
      title: 'Try Expo Router',
      startDate: null,
      someday: true,
      priority: 'med',
    });
  });

  it.each([
    ['sun', '2026-10-04'],
    ['mon', '2026-10-05'],
    ['monday', '2026-10-05'],
    ['tue', '2026-10-06'],
    ['tues', '2026-10-06'],
    ['wed', '2026-10-07'],
    ['thu', '2026-10-08'],
    ['thurs', '2026-10-08'],
    ['fri', '2026-10-09'],
    ['friday', '2026-10-09'],
    ['sat', '2026-10-03'],
  ])('@%s on a Friday is the next one', (word, startDate) => {
    expect(parseTaskSyntax(`Call @${word}`, FRI).startDate).toBe(startDate);
  });

  it('a weekday on that same weekday means a week out, not today', () => {
    expect(parseTaskSyntax('x @mon', '2026-10-05').startDate).toBe(
      '2026-10-12',
    );
    expect(parseTaskSyntax('x @fri', FRI).startDate).toBe('2026-10-09');
    expect(parseTaskSyntax('x @next week', '2026-10-05').startDate).toBe(
      '2026-10-12',
    );
    expect(parseTaskSyntax('x @today', '2026-10-05').startDate).toBe(
      '2026-10-05',
    );
  });

  it('a month and day is the next one on or after today', () => {
    expect(parseTaskSyntax('x @oct 2', FRI).startDate).toBe(FRI);
    expect(parseTaskSyntax('x @oct 1', FRI).startDate).toBe('2027-10-01');
    expect(parseTaskSyntax('x @sept 3', FRI).startDate).toBe('2027-09-03');
  });

  it('tokens are case-insensitive', () => {
    expect(parseTaskSyntax('x @Tomorrow !HIGH', FRI)).toEqual(
      dated('x', '2026-10-03', 'high'),
    );
    expect(parseTaskSyntax('x @Next Week', FRI).startDate).toBe('2026-10-05');
    expect(parseTaskSyntax('x @OCT 12', FRI).startDate).toBe('2026-10-12');
  });
});

describe('parseTaskSyntax mixing and titles', () => {
  it('tokens can sit anywhere, in any order', () => {
    const expected = dated(
      'Match resume PDF fonts to site',
      '2026-10-05',
      'high',
    );
    for (const input of [
      'Match resume PDF fonts to site @mon !high',
      'Match resume PDF fonts to site !high @mon',
      '!high Match resume PDF fonts @mon to site',
      '@mon !high Match resume PDF fonts to site',
    ]) {
      expect(parseTaskSyntax(input, FRI)).toEqual(expected);
    }
  });

  it('the last date token wins, someday included', () => {
    expect(parseTaskSyntax('x @tomorrow @oct 12', FRI).startDate).toBe(
      '2026-10-12',
    );
    expect(parseTaskSyntax('x @tomorrow @someday', FRI)).toMatchObject({
      startDate: null,
      someday: true,
    });
    expect(parseTaskSyntax('x @someday @tomorrow', FRI)).toMatchObject({
      startDate: '2026-10-03',
      someday: false,
    });
    expect(parseTaskSyntax('x !low !high', FRI).priority).toBe('high');
  });

  it('bare today and tomorrow are title words, not dates', () => {
    expect(parseTaskSyntax('Call bank tomorrow', FRI)).toEqual({
      title: 'Call bank tomorrow',
      startDate: null,
      someday: false,
      priority: 'med',
    });
    expect(parseTaskSyntax('Plan for Today show', FRI).title).toBe(
      'Plan for Today show',
    );
  });

  it('leaves non-tokens in the title', () => {
    for (const input of [
      'email me@tomorrow.com',
      'ping @sam about it',
      'x @oct',
      'x @feb 30',
      'x @2026-02-30',
      'x @tomorrow,',
      'x !urgent',
      'x !highest',
    ]) {
      expect(parseTaskSyntax(input, FRI)).toEqual({
        title: input,
        startDate: null,
        someday: false,
        priority: 'med',
      });
    }
  });

  it('a lone token leaves an empty title', () => {
    expect(parseTaskSyntax('  @tomorrow  ', FRI)).toEqual(
      dated('', '2026-10-03'),
    );
  });

  it('collapses the gaps tokens leave', () => {
    expect(parseTaskSyntax('  Buy   @tomorrow  milk  ', FRI).title).toBe(
      'Buy milk',
    );
  });

  it('a too-long month-day falls back to the shorter token', () => {
    expect(parseTaskSyntax('x @mon 3', FRI)).toEqual(
      dated('x 3', '2026-10-05'),
    );
  });
});

describe('parseTaskSyntax across month and year boundaries', () => {
  it.each([
    ['2026-09-30', '@tomorrow', '2026-10-01'],
    ['2026-01-31', '@tomorrow', '2026-02-01'],
    ['2026-02-28', '@tomorrow', '2026-03-01'],
    ['2028-02-28', '@tomorrow', '2028-02-29'],
    ['2026-12-31', '@tomorrow', '2027-01-01'],
    ['2026-12-31', '@mon', '2027-01-04'],
    ['2026-12-28', '@mon', '2027-01-04'],
    ['2026-12-31', '@next week', '2027-01-04'],
    ['2026-12-31', '@jan 3', '2027-01-03'],
    ['2026-12-31', '@dec 31', '2026-12-31'],
    ['2026-12-31', '@dec 30', '2027-12-30'],
    ['2026-01-31', '@sat', '2026-02-07'],
    ['2026-03-01', '@feb 29', '2028-02-29'],
    ['2028-02-29', '@feb 29', '2028-02-29'],
  ])('on %s, %s is %s', (today, token, startDate) => {
    expect(parseTaskSyntax(`x ${token}`, today).startDate).toBe(startDate);
  });
});

describe.each(['America/New_York', 'Pacific/Auckland'])(
  'local time in %s',
  (tz) => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const at = (clock: readonly number[]) => {
      const [y, mo, d, h, mi] = clock as [
        number,
        number,
        number,
        number,
        number,
      ];
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(y, mo, d, h, mi));
    };

    it('takes today from the local clock, not UTC, late at night', () => {
      at([2026, 11, 31, 23, 30]);
      expect(localDateString()).toBe('2026-12-31');
      expect(parseTaskSyntax('x @tomorrow').startDate).toBe('2027-01-01');
      expect(parseTaskSyntax('x @jan 3').startDate).toBe('2027-01-03');
    });

    it('takes today from the local clock just after midnight', () => {
      at([2027, 0, 1, 0, 30]);
      expect(localDateString()).toBe('2027-01-01');
      expect(parseTaskSyntax('x @today').startDate).toBe('2027-01-01');
      expect(parseTaskSyntax('x @fri').startDate).toBe('2027-01-08');
    });

    it.each([
      // New York: clocks go forward Mar 8 and back Nov 1, 2026.
      [[2026, 2, 8, 0, 30], '2026-03-08', '2026-03-09'],
      [[2026, 2, 7, 23, 30], '2026-03-07', '2026-03-08'],
      [[2026, 10, 1, 0, 30], '2026-11-01', '2026-11-02'],
      [[2026, 9, 31, 23, 30], '2026-10-31', '2026-11-01'],
      // Auckland: back Apr 5, forward Sep 27, 2026.
      [[2026, 3, 5, 0, 30], '2026-04-05', '2026-04-06'],
      [[2026, 8, 27, 0, 30], '2026-09-27', '2026-09-28'],
    ] as const)('around a DST change at %j', (clock, today, tomorrow) => {
      at(clock);
      expect(localDateString()).toBe(today);
      expect(parseTaskSyntax('x @tomorrow').startDate).toBe(tomorrow);
      expect(parseTaskSyntax('x @mon').startDate).toBe(
        parseTaskSyntax('x @next week').startDate,
      );
    });
  },
);

describe('date menu helpers', () => {
  it('offers Tomorrow, Monday, Next week and Someday with resolved dates', () => {
    expect(
      taskDateMenuOptions(FRI).map((o) => [o.label, o.detail, o.token]),
    ).toEqual([
      ['Tomorrow', 'Sat, Oct 3', '@tomorrow'],
      ['Monday', 'Oct 5', '@mon'],
      ['Next week', 'Mon, Oct 5', '@next week'],
      ['Someday', 'No date, parked', '@someday'],
    ]);
  });

  it('every option token parses back to the option schedule', () => {
    for (const today of [FRI, '2026-10-05', '2026-12-31']) {
      for (const option of taskDateMenuOptions(today)) {
        expect(parseTaskSyntax(`x ${option.token}`, today)).toMatchObject({
          title: 'x',
          startDate: option.startDate,
          someday: option.someday,
        });
      }
    }
  });

  it('a picked date becomes the shortest token that resolves to it', () => {
    expect(taskDateToken('2026-10-12', FRI)).toBe('@oct 12');
    expect(taskDateToken('2027-09-30', FRI)).toBe('@sep 30');
    expect(taskDateToken('2027-10-12', FRI)).toBe('@2027-10-12');
    expect(taskDateToken('2026-09-30', FRI)).toBe('@2026-09-30');
    for (const day of ['2026-10-12', '2027-10-12', '2026-09-30']) {
      expect(
        parseTaskSyntax(`x ${taskDateToken(day, FRI)}`, FRI).startDate,
      ).toBe(day);
    }
  });

  it('formats days in English with or without the weekday', () => {
    expect(formatTaskDay('2026-10-03')).toBe('Sat, Oct 3');
    expect(formatTaskDay('2026-10-03', false)).toBe('Oct 3');
  });

  it('finds the @word being typed at the caret', () => {
    const line = 'Match fonts @mo';
    expect(activeTaskDateQuery(line, line.length)).toEqual({
      from: 12,
      to: 15,
      query: 'mo',
    });
    expect(activeTaskDateQuery('x @', 3)).toEqual({
      from: 2,
      to: 3,
      query: '',
    });
    expect(activeTaskDateQuery('@', 1)).toEqual({ from: 0, to: 1, query: '' });
    expect(activeTaskDateQuery('x @mon y', 6)).toEqual({
      from: 2,
      to: 6,
      query: 'mon',
    });
    expect(activeTaskDateQuery('me@x', 4)).toBeNull();
    expect(activeTaskDateQuery('x @mon ', 7)).toBeNull();
    expect(activeTaskDateQuery('x @mon', 4)).toBeNull();
  });
});
