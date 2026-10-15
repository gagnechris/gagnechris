import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Chip, ChipSelect } from './Chip.js';

describe('Chip', () => {
  test('tones map to classes and the remove button names the value', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Chip tone="selected" dot onRemove={onRemove}>
        design
      </Chip>,
    );
    expect(screen.getByText('design').parentElement).toHaveClass(
      'ui-chip--selected',
    );
    await user.tab();
    const remove = screen.getByRole('button', { name: 'Remove design' });
    expect(remove).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('with onClick it is a toggle button', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip onClick={onClick} pressed>
        Overdue
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Overdue' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(onClick).toHaveBeenCalled();
  });

  test('a button chip takes a ref and can be disabled', () => {
    let el: HTMLButtonElement | null = null;
    render(
      <Chip
        onClick={() => {}}
        disabled
        ref={(node) => {
          el = node;
        }}
      >
        Start
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Start' });
    expect(chip).toBeDisabled();
    expect(el).toBe(chip);
  });
});

const AreaChip = () => {
  const [value, setValue] = useState<'work' | 'home' | null>(null);
  return (
    <ChipSelect
      label="Area"
      value={value}
      onChange={setValue}
      options={[
        { value: 'work', label: 'Work' },
        { value: 'home', label: 'Home' },
      ]}
    />
  );
};

describe('ChipSelect', () => {
  test('an empty chip reads as an add action and opens a menu of choices', async () => {
    const user = userEvent.setup();
    render(<AreaChip />);
    const trigger = screen.getByRole('button', { name: 'Add area' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu', { name: 'Area' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Work' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.queryByRole('menu')).toBeNull();
    const chosen = screen.getByRole('button', { name: 'Area: Home' });
    expect(chosen).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitemradio', { name: 'Home' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
