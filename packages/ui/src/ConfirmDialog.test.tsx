import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.js';

describe('ConfirmDialog', () => {
  test('answers yes from the action and no from Cancel and Escape', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(
      <ConfirmDialog
        message="Delete this note?"
        action="Delete"
        onAnswer={onAnswer}
      />,
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Delete this note?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');

    expect(onAnswer.mock.calls).toEqual([[true], [false], [false]]);
  });
});
