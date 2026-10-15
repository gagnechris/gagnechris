import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Checkbox } from './Checkbox.js';

describe('Checkbox', () => {
  test('the whole label toggles it, and Space works from the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Featured" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Featured' });
    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
    await user.click(screen.getByText('Featured'));
    expect(box).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test('square has a mixed state', () => {
    render(<Checkbox label="Select all" indeterminate onChange={() => {}} />);
    const box = screen.getByRole('checkbox', { name: 'Select all' });
    expect((box as HTMLInputElement).indeterminate).toBe(true);
    expect(box).toBePartiallyChecked();
  });

  test('round task shape keeps a hidden label and reads a dropped task', () => {
    render(
      <Checkbox
        shape="round"
        hideLabel
        dropped
        label="Pay rent"
        onChange={() => {}}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Pay rent, dropped' });
    expect(box.closest('label')).toHaveClass(
      'ui-check--round',
      'ui-check--dropped',
    );
  });

  test('disabled cannot be toggled', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Locked" disabled />);
    const box = screen.getByRole('checkbox', { name: 'Locked' });
    await user.click(box);
    expect(box).not.toBeChecked();
  });
});
