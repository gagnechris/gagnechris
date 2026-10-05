import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MarkdownBodyEditor } from './MarkdownBodyEditor';

vi.mock('./MarkdownEditor', () => ({
  default: () => <textarea aria-label="Markdown" />,
}));

describe('MarkdownBodyEditor', () => {
  test('Write, Split and Preview pick the panes; Preview hides the insert toolbar', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownBodyEditor
        value=""
        onChange={() => {}}
        onUploadImages={() => Promise.resolve([])}
        preview={<div />}
      />,
    );
    const split = () => container.querySelector('.markdown-split');
    await screen.findByLabelText('Markdown');

    for (const [tab, pane] of [
      ['Split', 'split'],
      ['Preview', 'preview'],
      ['Write', 'write'],
    ] as const) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(split()).toHaveAttribute('data-pane', pane);
      expect(screen.queryByRole('toolbar', { name: 'Insert' }) !== null).toBe(
        pane !== 'preview',
      );
    }
  });
});
