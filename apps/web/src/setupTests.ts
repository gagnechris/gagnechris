import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { clearPendingFlushes } from '@gagnechris/app-core';

// Editors unmounted by cleanup hand unsaved edits to a module-level queue;
// do not let one test's queue reach the next test's editors.
afterEach(() => {
  clearPendingFlushes();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
