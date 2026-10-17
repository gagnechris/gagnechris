import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MarkdownBodyEditor } from './MarkdownBodyEditor';

vi.mock('./MarkdownEditor', () => ({
  default: () => <textarea aria-label="Markdown" />,
}));

describe('MarkdownBodyEditor', () => {
  test('one pane with no view toggles; Preview page opens in a new tab', async () => {
    const onOpen = vi.fn();
    render(
      <MarkdownBodyEditor
        value="# Hi"
        onChange={() => {}}
        onUploadImages={() => Promise.resolve([])}
        previewPage={{ href: '/preview/post/1', onOpen }}
      />,
    );
    await screen.findByLabelText('Markdown');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Insert' })).toBeVisible();

    const link = screen.getByRole('link', { name: /Preview page/ });
    expect(link).toHaveAttribute('href', '/preview/post/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAccessibleName(/^Preview page ?\(opens in a new tab\)$/);
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test('the Insert toolbar is one tab stop, the image picker included', async () => {
    const user = userEvent.setup();
    render(
      <MarkdownBodyEditor
        value=""
        onChange={() => {}}
        onUploadImages={() => Promise.resolve([])}
      />,
    );
    await screen.findByLabelText('Markdown');
    const toolbar = screen.getByRole('toolbar', { name: 'Insert' });
    const image = within(toolbar).getByRole('button', { name: 'Insert image' });
    image.focus();
    await user.tab();
    expect(toolbar).not.toContainElement(document.activeElement as HTMLElement);
    image.focus();
    await user.keyboard('{ArrowRight}');
    expect(
      within(toolbar).getByRole('button', { name: 'Insert link' }),
    ).toHaveFocus();
  });
});
