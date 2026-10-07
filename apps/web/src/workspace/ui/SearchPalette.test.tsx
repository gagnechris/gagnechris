import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import SearchPalette from './SearchPalette';

function Harness() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setOpen(true)}>
        Search
      </button>
      {open ? (
        <SearchPalette
          label="Search notes"
          placeholder="Search"
          q={q}
          onQueryChange={setQ}
          groups={['Notes']}
          hits={[{ key: 'a', group: 'Notes', to: '/a', title: 'A note' }]}
          toolbar={<button type="button">Scope</button>}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </MemoryRouter>
  );
}

describe('SearchPalette', () => {
  test('is a modal: focus starts in the search box, Tab stays inside, Escape returns focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Search' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Search notes' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByRole('combobox', { name: 'Search notes' }),
    ).toHaveFocus();
    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 5; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  test('the backdrop closes it and focus goes back', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Search' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
