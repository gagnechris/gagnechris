import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MarkdownBodyEditor } from './MarkdownBodyEditor';

vi.mock('./MarkdownEditor', () => ({
  default: () => <textarea aria-label="Markdown" />,
}));

describe('MarkdownBodyEditor', () => {
  test('one pane, no Write/Split/Preview tabs; Preview swaps in the given renderer and hides the insert toolbar', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownBodyEditor
        value="# Hi"
        onChange={() => {}}
        onUploadImages={() => Promise.resolve([])}
        preview={<div data-testid="published" />}
      />,
    );
    await screen.findByLabelText('Markdown');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(container.querySelector('.markdown-single')).toHaveAttribute(
      'data-previewing',
      'false',
    );
    expect(screen.queryByTestId('published')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Insert' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('region', { name: 'Preview' })).toContainElement(
      screen.getByTestId('published'),
    );
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveFocus();
    expect(screen.queryByRole('toolbar', { name: 'Insert' })).toBeNull();

    await user.keyboard('{Control>}/{/Control}');
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Insert' })).toBeVisible();
  });
});
