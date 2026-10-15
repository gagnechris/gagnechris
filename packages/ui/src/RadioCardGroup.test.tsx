import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { RadioCardGroup } from './RadioCardGroup.js';

type Level = 'viewer' | 'editor' | 'owner' | 'admin';

const Harness = () => {
  const [value, setValue] = useState<Level>('viewer');
  return (
    <RadioCardGroup
      label="Access level"
      value={value}
      onChange={setValue}
      options={[
        {
          value: 'viewer',
          title: 'Viewer',
          description: 'Can read everything.',
        },
        { value: 'editor', title: 'Editor', description: 'Can edit posts.' },
        { value: 'owner', title: 'Owner', disabled: true },
        { value: 'admin', title: 'Admin', description: 'Can manage users.' },
      ]}
    />
  );
};

describe('RadioCardGroup', () => {
  test('cards are radios named by their title and described by their sentence', () => {
    render(<Harness />);
    expect(
      screen.getByRole('radiogroup', { name: 'Access level' }),
    ).toBeInTheDocument();
    const viewer = screen.getByRole('radio', { name: 'Viewer' });
    expect(viewer).toBeChecked();
    expect(viewer).toHaveAccessibleDescription('Can read everything.');
    expect(screen.getByRole('radio', { name: 'Owner' })).toBeDisabled();
  });

  test('one tab stop; arrows move the selection and skip disabled cards', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
    await user.tab();
    expect(radios[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(radios[3]).toHaveFocus();
    expect(radios[3]).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(radios[0]).toBeChecked();
    await user.keyboard('{ArrowUp}');
    expect(radios[3]).toBeChecked();
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, -1, 0]);
  });
});
