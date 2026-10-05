import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { NotebookCalendar } from './NotebookCalendar';

function Harness({
  initial,
  onSelect,
}: {
  initial: string;
  onSelect: (date: string) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <NotebookCalendar
      selected={selected}
      markedDates={new Set(['2026-10-07'])}
      onSelect={(date) => {
        onSelect(date);
        setSelected(date);
      }}
    />
  );
}

const cell = (name: RegExp) => screen.getByRole('gridcell', { name });

describe('NotebookCalendar', () => {
  test('is a grid of week rows with full day names and the note marker', () => {
    render(<Harness initial="2026-10-05" onSelect={() => {}} />);

    const grid = screen.getByRole('grid', { name: /October 2026/ });
    expect(screen.getAllByRole('row')[0]).toBe(grid.firstElementChild);
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(cell(/October 5, 2026/)).toHaveAttribute('aria-selected', 'true');
    expect(cell(/October 7, 2026, has a note/)).toBeInTheDocument();
  });

  test('only the selected day is a tab stop', () => {
    render(<Harness initial="2026-10-05" onSelect={() => {}} />);

    expect(cell(/October 5, 2026/)).toHaveAttribute('tabindex', '0');
    expect(cell(/October 6, 2026/)).toHaveAttribute('tabindex', '-1');
  });

  test('arrows move focus, Enter opens the day', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness initial="2026-10-05" onSelect={onSelect} />);

    cell(/October 5, 2026/).focus();
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(cell(/October 13, 2026/)).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('2026-10-13');
  });

  test('arrows stop at the ends of the month; PageDown opens the next month', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness initial="2026-10-28" onSelect={onSelect} />);

    cell(/October 28, 2026/).focus();
    await user.keyboard('{ArrowDown}');
    expect(cell(/October 31, 2026/)).toHaveFocus();

    await user.keyboard('{PageDown}');
    expect(onSelect).toHaveBeenCalledWith('2026-11-01');
    expect(cell(/November 1, 2026/)).toHaveFocus();
  });
});
