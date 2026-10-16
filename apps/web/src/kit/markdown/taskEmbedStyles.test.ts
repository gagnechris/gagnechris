import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Vitest doesn't process CSS, so read the sheets.
const read = (rel: string) =>
  fs
    .readFileSync(path.resolve(__dirname, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const markdownCss = read('markdown.css');
const workspaceCss = read('../../workspace/workspace.css');

/** Declarations from every rule whose selector list includes `selector`. */
function rulesFor(css: string, selector: string): string {
  const bodies: string[] = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (
      selectors!
        .split(',')
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .includes(selector)
    ) {
      bodies.push(body!);
    }
  }
  return bodies.join('\n');
}

describe('task row drag handle', () => {
  test('the app-wide button hover resets transform', () => {
    expect(rulesFor(workspaceCss, ':root button:hover')).toMatch(
      /transform:\s*none/,
    );
  });

  test('is placed on the title line without a transform', () => {
    const handle = rulesFor(markdownCss, '.task-embed__handle');
    expect(handle).not.toMatch(/transform/);
    expect(handle).toMatch(
      /top:\s*calc\(var\(--task-embed-line\) \/ 2 - 0\.75rem\)/,
    );
    expect(handle).toMatch(/height:\s*1\.5rem/);
  });

  test('the check, title and subtask guide sit on the same first line', () => {
    expect(rulesFor(markdownCss, '.task-embed__check')).toMatch(
      /align-self:\s*flex-start;[\s\S]*min-height:\s*var\(--task-embed-line\)/,
    );
    expect(rulesFor(markdownCss, '.task-embed__title-wrap')).toMatch(
      /align-self:\s*flex-start/,
    );
    expect(
      rulesFor(
        markdownCss,
        '.markdown-editor .cm-line.cm-task-line--sub::before',
      ),
    ).toMatch(/height:\s*calc\(var\(--task-embed-line\) \/ 2\)/);
  });
});
