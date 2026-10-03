import { beforeEach, describe, expect, test } from 'vitest';
import { readHighScore, writeHighScore } from './highScore';

describe('bears high scores', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('are stored per game', () => {
    writeHighScore('camp', 420);
    writeHighScore('wild', 88);
    expect(readHighScore('camp')).toBe(420);
    expect(readHighScore('wild')).toBe(88);
  });

  test('camp reads the original key so existing scores carry over', () => {
    localStorage.setItem('dont-feed-the-bears-high-score', '5');
    expect(readHighScore('camp')).toBe(5);
    expect(readHighScore('wild')).toBe(0);
  });

  test('ignores junk values', () => {
    localStorage.setItem('dont-feed-the-bears-high-score', 'nope');
    expect(readHighScore('camp')).toBe(0);
  });
});
