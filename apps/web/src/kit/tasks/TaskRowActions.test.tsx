import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TaskRowActions } from './TaskRowActions';

describe('TaskRowActions', () => {
  test('snoozes to the Monday after the base day and drops', async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn();
    const onDrop = vi.fn();
    render(
      <TaskRowActions
        title="Pay rent"
        snoozeFrom="2026-10-14"
        onSnooze={onSnooze}
        onDrop={onDrop}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /^Snooze Pay rent to Mon/ }),
    );
    expect(onSnooze).toHaveBeenCalledWith({
      startDate: '2026-10-19',
      someday: false,
    });
    await user.click(screen.getByRole('button', { name: 'Drop Pay rent' }));
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  test('has no Drop without onDrop', () => {
    render(
      <TaskRowActions
        title="Pay rent"
        snoozeFrom="2026-10-14"
        onSnooze={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Drop Pay rent' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Snooze Pay rent to another day' }),
    ).toBeInTheDocument();
  });
});
