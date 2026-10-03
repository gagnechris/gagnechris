import { describe, expect, test } from 'vitest';
import {
  BEARS_GAME_PATHS,
  BEARS_LANDING_PATH,
  bearsFromParam,
  otherGame,
  withFrom,
} from './routes';

describe('bears routes', () => {
  test('game paths sit under the landing page', () => {
    expect(BEARS_GAME_PATHS.camp).toBe('/dont-feed-the-bears/camp');
    expect(BEARS_GAME_PATHS.wild).toBe('/dont-feed-the-bears/wild');
  });

  test('bearsFromParam defaults to direct', () => {
    expect(bearsFromParam(new URLSearchParams(''))).toBe('direct');
    expect(bearsFromParam(new URLSearchParams('from=%20'))).toBe('direct');
    expect(bearsFromParam(new URLSearchParams('from=resume'))).toBe('resume');
  });

  test('withFrom carries the entry point and omits direct', () => {
    expect(withFrom(BEARS_GAME_PATHS.camp, 'resume')).toBe(
      '/dont-feed-the-bears/camp?from=resume',
    );
    expect(withFrom(BEARS_GAME_PATHS.camp, 'direct')).toBe(
      '/dont-feed-the-bears/camp',
    );
    expect(withFrom(BEARS_LANDING_PATH, '404', 'tips')).toBe(
      '/dont-feed-the-bears?from=404#tips',
    );
  });

  test('otherGame swaps sides', () => {
    expect(otherGame('camp')).toBe('wild');
    expect(otherGame('wild')).toBe('camp');
  });
});
