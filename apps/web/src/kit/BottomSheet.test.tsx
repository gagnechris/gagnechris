import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  test('Close, Done and Escape close it; a field marked autofocus takes focus', async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="Details" label="Post details" onClose={onClose}>
        <input aria-label="Slug" data-autofocus />
      </BottomSheet>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Post details' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(screen.getByLabelText('Slug')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test('a page can put its own action in place of Done', () => {
    render(
      <BottomSheet
        title="Invite user"
        onClose={() => {}}
        done={<button type="button">Send</button>}
      >
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});
