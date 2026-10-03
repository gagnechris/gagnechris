import { afterEach, describe, expect, test, vi } from 'vitest';
import { isDevProdApiTarget } from './apiTarget';

describe('isDevProdApiTarget', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('is false when VITE_API_TARGET is unset', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_TARGET', '');
    expect(isDevProdApiTarget()).toBe(false);
  });

  test('is true in DEV when VITE_API_TARGET=prod', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_API_TARGET', 'prod');
    expect(isDevProdApiTarget()).toBe(true);
  });

  test('is false when not DEV even if VITE_API_TARGET=prod', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_TARGET', 'prod');
    expect(isDevProdApiTarget()).toBe(false);
  });
});
