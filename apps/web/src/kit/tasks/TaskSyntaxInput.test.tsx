import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TaskSyntaxInput } from './TaskSyntaxInput';

// 2026-10-02 is a Friday.
const TODAY = '2026-10-02';

function Harness({
  onSubmit = () => {},
  onKeyDown,
  initial = '',
}: {
  onSubmit?: (value: string) => void;
  onKeyDown?: () => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div onKeyDown={onKeyDown}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <TaskSyntaxInput
          aria-label="Task"
          today={TODAY}
          value={value}
          onChange={setValue}
        />
      </form>
      <button type="button">Elsewhere</button>
    </div>
  );
}

const combobox = () => screen.getByRole('combobox', { name: 'Task' });
const optionNames = () =>
  within(screen.getByRole('listbox', { name: 'Show this task on…' }))
    .getAllByRole('option')
    .map((o) => o.textContent);
const activeOption = () => {
  const id = combobox().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('TaskSyntaxInput @ menu', () => {
  test('typing @ opens a listbox of dates with the resolved day beside each', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(combobox(), 'Match fonts @');

    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(combobox()).toHaveAttribute('aria-autocomplete', 'list');
    const listbox = screen.getByRole('listbox', { name: 'Show this task on…' });
    expect(combobox()).toHaveAttribute('aria-controls', listbox.id);
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'TomorrowSat, Oct 3',
      'MondayOct 5',
      'Next weekMon, Oct 5',
      'SomedayNo date, parked',
      'Pick a date…',
      'Deadline…due:',
    ]);
    expect(
      screen.getByRole('option', { name: 'Tomorrow, Sat, Oct 3' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(activeOption()).toHaveTextContent('Tomorrow');
    expect(screen.getByRole('status')).toHaveTextContent(
      '6 date options. Up and down to move, Enter to choose, Escape to close.',
    );
    expect(combobox()).toHaveAccessibleDescription(
      'Shows up on Today from that date.',
    );
  });

  test('arrows move the active option and wrap; Enter inserts its token without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(combobox(), 'Match fonts @');
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Monday');
    expect(
      screen.getByRole('option', { name: 'Monday, Oct 5' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('option', { name: 'Tomorrow, Sat, Oct 3' }),
    ).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Deadline…');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Monday');

    await user.keyboard('{Enter}');

    expect(combobox()).toHaveValue('Match fonts @mon ');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).not.toHaveAttribute('aria-activedescendant');
    expect(onSubmit).not.toHaveBeenCalled();
    expect((combobox() as HTMLInputElement).selectionStart).toBe(17);

    await user.keyboard('!high{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('Match fonts @mon !high');
  });

  test('Esc closes the menu, keeps the text, and does not reach the page', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(<Harness onKeyDown={onKeyDown} />);

    await user.type(combobox(), 'x @to');
    onKeyDown.mockClear();
    await user.keyboard('{Escape}');

    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).toHaveValue('x @to');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(onKeyDown).not.toHaveBeenCalled();

    await user.keyboard(' @');
    expect(combobox()).toHaveAttribute('aria-expanded', 'true');
  });

  test('typing after @ filters the options; no match or a finished token closes it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(combobox(), 'x @ne');
    expect(optionNames()).toEqual(['Next weekMon, Oct 5']);
    expect(screen.getByRole('status')).toHaveTextContent('1 date option.');
    await user.keyboard('{Enter}');
    expect(combobox()).toHaveValue('x @next week ');

    await user.clear(combobox());
    await user.type(combobox(), 'x @zz');
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');

    await user.clear(combobox());
    await user.type(combobox(), 'Call bank @mon{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('Call bank @mon');
  });

  test('Deadline… switches the menu to due: dates without Someday', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(combobox(), 'File taxes @dead');
    expect(optionNames()).toEqual(['Deadline…due:']);
    await user.keyboard('{Enter}');
    expect(combobox()).toHaveValue('File taxes due:');

    const listbox = screen.getByRole('listbox', { name: 'Deadline…' });
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'TomorrowSat, Oct 3',
      'MondayOct 5',
      'Next weekMon, Oct 5',
      'Pick a date…',
    ]);
    expect(combobox()).toHaveAccessibleDescription(
      'A deadline; it does not change when the task shows.',
    );
    await user.keyboard('{ArrowDown}{Enter}');
    expect(combobox()).toHaveValue('File taxes due:mon ');

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('File taxes due:mon ');
  });

  test('Pick a date under due: inserts a due: token', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(combobox(), 'Renew passport due:');
    await user.keyboard('{End}{Enter}');
    const picker = screen.getByLabelText('Pick a date');
    await user.clear(picker);
    await user.type(picker, '2026-10-12{Enter}');
    expect(combobox()).toHaveValue('Renew passport due:oct 12 ');
  });

  test('clicking an option inserts it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(combobox(), 'Park it @');
    await user.click(screen.getByRole('option', { name: /Someday/ }));
    expect(combobox()).toHaveValue('Park it @someday ');
    expect(combobox()).toHaveFocus();
  });

  test('Pick a date opens a date field; Enter inserts a token for the day, Esc goes back', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(combobox(), 'Renew passport @');
    await user.keyboard('{End}{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Pick a date…');
    await user.keyboard('{Enter}');

    const picker = screen.getByLabelText('Pick a date');
    expect(picker).toHaveFocus();
    expect(picker).toHaveValue('2026-10-03');
    fireEvent.change(picker, { target: { value: '2026-11-01' } });
    await user.keyboard('{Enter}');

    expect(combobox()).toHaveValue('Renew passport @nov 1 ');
    expect(combobox()).toHaveFocus();
    expect(screen.queryByLabelText('Pick a date')).not.toBeInTheDocument();

    await user.keyboard('@pick');
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Pick a date')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(combobox()).toHaveFocus();
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(combobox()).toHaveValue('Renew passport @nov 1 @pick');
  });

  test('leaving the field closes the menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(combobox(), 'x @');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(combobox()).toHaveAttribute('aria-expanded', 'false');
  });
});
