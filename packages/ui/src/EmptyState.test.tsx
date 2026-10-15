import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Button } from './Button.js';
import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  test('reads title then sentence, hides the icon and offers the action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <EmptyState
        title="No notes yet"
        icon={<svg />}
        action={<Button onClick={onClick}>New note</Button>}
      >
        Notes you write show up here.
      </EmptyState>,
    );
    expect(container.firstElementChild).toHaveTextContent(
      'No notes yetNotes you write show up here.New note',
    );
    expect(container.querySelector('.ui-empty__icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'New note' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });
});
