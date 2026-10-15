/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// The publisher renders these, and the local stack runs it through tsx, which
// reads one tsconfig for every file: each component file names its runtime.
const sources = import.meta.glob<string>(['./*.tsx', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('component files', () => {
  it.each(Object.entries(sources))('%s sets the JSX runtime', (_file, text) => {
    expect(text).toMatch(/^\/\*\* @jsxRuntime automatic \*\/\n/);
  });
});
