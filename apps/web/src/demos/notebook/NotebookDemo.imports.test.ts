import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { parseTaskSyntax } from '@gagnechris/shared';
import { notebookDemoReducer, seedNotebookDemo } from './notebookDemoState';

vi.mock('@gagnechris/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gagnechris/shared')>();
  return { ...actual, parseTaskSyntax: vi.fn(actual.parseTaskSyntax) };
});

const src = path.resolve(__dirname, '../..');

/** The specifier a file imports `parseTaskSyntax` from. */
const parserImport = (file: string): string | undefined => {
  const code = readFileSync(path.join(src, file), 'utf8');
  for (const match of code.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g,
  )) {
    if (/\bparseTaskSyntax\b/.test(match[1]!)) return match[2];
  }
  return undefined;
};

describe('the Notebook demo parser', () => {
  test('is imported from the module the Notebook app imports it from', () => {
    expect(parserImport('demos/notebook/notebookDemoState.ts')).toBe(
      '@gagnechris/shared',
    );
  });

  test('is the function the demo calls', () => {
    const parser = vi.mocked(parseTaskSyntax);
    const state = seedNotebookDemo(new Date(2026, 9, 2, 9));
    notebookDemoReducer(
      notebookDemoReducer(state, { type: 'type', value: 'Call Sam @mon' }),
      { type: 'add' },
    );
    expect(parser).toHaveBeenLastCalledWith('Call Sam @mon', '2026-10-02');
    expect(parser).toHaveBeenCalledTimes(1);
  });
});
