import { describe, expect, test } from 'vitest';
import {
  CLOSED_TASK_DATE_MENU,
  taskDateMenuIsOpen,
  taskDateMenuKey,
  taskDateMenuReducer as reduce,
  tokenInsertion,
} from './task-date-menu-state.js';

describe('taskDateMenuReducer', () => {
  test('moves wrap, Home/End jump, and an out-of-range active is clamped first', () => {
    let s = reduce(CLOSED_TASK_DATE_MENU, { type: 'move', step: -1, count: 4 });
    expect(s.active).toBe(3);
    s = reduce(s, { type: 'move', step: 1, count: 4 });
    expect(s.active).toBe(0);
    s = reduce(s, { type: 'move', step: 'last', count: 4 });
    expect(s.active).toBe(3);
    s = reduce(s, { type: 'move', step: 1, count: 2 });
    expect(s.active).toBe(0);
  });

  test('Esc closes the menu for that query only; typing reopens it', () => {
    let s = reduce(CLOSED_TASK_DATE_MENU, { type: 'dismiss', at: 5 });
    expect(taskDateMenuIsOpen(s, 5)).toBe(false);
    expect(taskDateMenuIsOpen(s, 9)).toBe(true);
    s = reduce(s, { type: 'typed' });
    expect(taskDateMenuIsOpen(s, 5)).toBe(true);
  });

  test('cancelling Pick a date closes the menu at the picked query; edits move both', () => {
    let s = reduce(CLOSED_TASK_DATE_MENU, {
      type: 'pick',
      range: { from: 4, to: 8, kind: 'due' },
    });
    expect(taskDateMenuIsOpen(s, null)).toBe(true);
    s = reduce(s, { type: 'mapped', mapPos: (p) => p + 2 });
    expect(s.picking).toEqual({ from: 6, to: 10, kind: 'due' });
    s = reduce(s, { type: 'cancel-pick' });
    expect(s).toMatchObject({ picking: null, dismissedAt: 6 });
  });
});

describe('taskDateMenuKey', () => {
  test('maps list keys; Space chooses only where asked', () => {
    expect(taskDateMenuKey('ArrowDown', 3)).toEqual({
      type: 'move',
      step: 1,
      count: 3,
    });
    expect(taskDateMenuKey('Enter', 3)).toBe('choose');
    expect(taskDateMenuKey('Escape', 3)).toBe('dismiss');
    expect(taskDateMenuKey(' ', 3)).toBeNull();
    expect(taskDateMenuKey(' ', 3, { chooseWithSpace: true })).toBe('choose');
    expect(taskDateMenuKey('a', 3)).toBeNull();
  });
});

describe('tokenInsertion', () => {
  const at = (text: string, token: string) => {
    const from = text.indexOf('@');
    const to = text.indexOf('|');
    const plain = text.replace('|', '');
    const c = tokenInsertion({ from, to }, token, plain.slice(to));
    const next = plain.slice(0, c.from) + c.insert + plain.slice(c.to);
    return next.slice(0, c.caret) + '|' + next.slice(c.caret);
  };

  test('one space after a finished token, unless whitespace already follows', () => {
    expect(at('Call @to|', '@tomorrow')).toBe('Call @tomorrow |');
    expect(at('Call @to|Sam', '@tomorrow')).toBe('Call @tomorrow |Sam');
    expect(at('Call @to|  Sam', '@tomorrow')).toBe('Call @tomorrow | Sam');
  });

  test('due: takes no space, its date comes next', () => {
    expect(at('Pay @dead|', 'due:')).toBe('Pay due:|');
    expect(at('Pay @dead| rent', 'due:')).toBe('Pay due:| rent');
  });
});
