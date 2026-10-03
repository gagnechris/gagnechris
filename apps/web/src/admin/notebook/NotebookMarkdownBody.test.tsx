import { describe, expect, test, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ markdownCss: false }));

vi.mock('../../components/markdown/markdown.css', () => {
  loaded.markdownCss = true;
  return {};
});

describe('NotebookMarkdownBody', () => {
  // Without it the Edit/Preview tabs fall back to the global white-on-sage
  // button style unless a post editor happened to load the sheet first.
  test('loads the markdown workspace styles itself', async () => {
    await import('./NotebookMarkdownBody');
    expect(loaded.markdownCss).toBe(true);
  });
});
