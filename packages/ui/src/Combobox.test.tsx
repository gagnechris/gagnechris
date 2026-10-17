import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Combobox, type ComboboxOption } from './Combobox.js';

const NOTES: ComboboxOption[] = [
  { id: 'a', label: 'Taxes 2026', meta: 'Oct 2' },
  { id: 'b', label: 'Tax receipts', disabled: true },
  { id: 'c', label: 'Travel' },
];

const Harness = ({
  onPick,
  options = NOTES,
  loading,
  error,
}: {
  onPick: (o: ComboboxOption) => void;
  options?: ComboboxOption[];
  loading?: boolean;
  error?: ReactNode;
}) => {
  const [value, setValue] = useState('');
  return (
    <div
      onKeyDown={(e) =>
        e.key === 'Escape' && onPick({ id: 'outer', label: '' })
      }
    >
      <Combobox
        aria-label="Linked note"
        value={value}
        onValueChange={setValue}
        options={options}
        onPick={onPick}
        loading={loading}
        error={error}
      />
    </div>
  );
};

describe('Combobox', () => {
  test("a click opens the list and still reaches the caller's onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Combobox
        aria-label="Linked note"
        value=""
        onValueChange={() => {}}
        options={NOTES}
        onPick={() => {}}
        onClick={onClick}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Linked note' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('listbox')).toBeVisible();
  });

  test('focus stays in the input while arrows move the active option', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const input = screen.getByRole('combobox', { name: 'Linked note' });
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.tab();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', { name: 'Linked note' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[2]!.id);
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', options[2]!.id);
    expect(input).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(NOTES[2]);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('Escape closes the list before it reaches the container', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(onPick).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onPick).toHaveBeenCalledWith({ id: 'outer', label: '' });
  });

  test('a click picks without moving focus', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: /Taxes 2026/ }));
    expect(onPick).toHaveBeenCalledWith(NOTES[0]);
    expect(input).toHaveFocus();
  });

  test('empty, loading and error states are announced', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness onPick={() => {}} options={[]} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
    rerender(<Harness onPick={() => {}} options={[]} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    rerender(<Harness onPick={() => {}} options={[]} error="Search failed" />);
    expect(screen.getByRole('status')).toHaveTextContent('Search failed');
  });
});
