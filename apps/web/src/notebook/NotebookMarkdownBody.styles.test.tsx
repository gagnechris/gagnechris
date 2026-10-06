import { describe, expect, test, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ markdownCss: false }));

vi.mock('../kit/markdown/markdown.css', () => {
  loaded.markdownCss = true;
  return {};
});

describe('NotebookMarkdownBody', () => {
  // Without it the View toggles and live-preview styles are missing unless
  // a post editor happened to load the sheet first.
  test('loads the markdown workspace styles itself', async () => {
    await import('./NotebookMarkdownBody');
    expect(loaded.markdownCss).toBe(true);
  });
});
