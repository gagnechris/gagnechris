import { vi } from 'vitest';

/** What the expo-router mock in `setup.ts` returns. */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  setParams: vi.fn(),
};

/** `useSegments()`; empty means a screen outside the tabs. */
export const segments: { current: string[] } = { current: [] };

export const searchParams: { current: Record<string, string> } = {
  current: {},
};
