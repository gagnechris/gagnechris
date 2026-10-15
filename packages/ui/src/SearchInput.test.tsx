import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { SearchInput } from './SearchInput.js';

const Harness = ({ onOuterEscape }: { onOuterEscape: () => void }) => {
  const [value, setValue] = useState('');
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape') onOuterEscape();
      }}
    >
      <SearchInput
        aria-label="Search notes"
        value={value}
        onValueChange={setValue}
      />
    </div>
  );
};

describe('SearchInput', () => {
  test('a clear button appears with text and returns focus to the box', async () => {
    const user = userEvent.setup();
    render(<Harness onOuterEscape={() => {}} />);
    const input = screen.getByRole('searchbox', { name: 'Search notes' });
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await user.type(input, 'tax');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  test('Escape clears first, then reaches the container', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(<Harness onOuterEscape={outer} />);
    const input = screen.getByRole('searchbox', { name: 'Search notes' });
    await user.type(input, 'tax');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(outer).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
