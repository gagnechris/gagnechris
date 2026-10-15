import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { DateInput } from './DateInput.js';
import { Field } from './Field.js';

describe('DateInput', () => {
  test('is a native date input labelled by its Field, with a hidden icon', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Due" hint="Leave empty for no date">
        <DateInput defaultValue="2026-10-15" />
      </Field>,
    );
    const input = screen.getByLabelText('Due');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-10-15');
    expect(input).toHaveAccessibleDescription('Leave empty for no date');
    expect(input.parentElement?.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await user.tab();
    expect(input).toHaveFocus();
  });
});
