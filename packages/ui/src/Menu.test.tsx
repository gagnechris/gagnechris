import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuRadioGroup,
  MenuSeparator,
} from './Menu.js';

const Harness = ({
  onRename = () => {},
  onDelete = () => {},
}: {
  onRename?: () => void;
  onDelete?: () => void;
}) => {
  const [sort, setSort] = useState<'updated' | 'title'>('updated');
  return (
    <>
      <Menu
        label="Note actions"
        trigger={(props) => (
          <button type="button" {...props}>
            More
          </button>
        )}
      >
        <MenuGroup label="Note">
          <MenuItem onSelect={onRename} shortcut="R">
            Rename
          </MenuItem>
          <MenuItem disabled>Archive</MenuItem>
          <MenuItem onSelect={onDelete} danger>
            Delete
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuRadioGroup
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'updated', label: 'Last updated' },
            { value: 'title', label: 'Title' },
          ]}
        />
      </Menu>
      <button type="button">Elsewhere</button>
    </>
  );
};

const mockPhone = (matches: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Menu', () => {
  test('the trigger opens it, focus moves in, and Escape returns focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Note actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test('arrows skip disabled items and wrap; Home, End and typing jump', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: 'Title' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: 'Title' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('l');
    expect(
      screen.getByRole('menuitemradio', { name: 'Last updated' }),
    ).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('ArrowUp on the trigger opens on the last item; Enter picks and closes', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);
    screen.getByRole('button', { name: 'More' }).focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: 'Title' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitemradio', { name: 'Title' }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
  });

  test('disabled items do nothing; an outside click closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('under 768px the items open in a bottom sheet', async () => {
    mockPhone(true);
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness onRename={onRename} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'Note actions' });
    expect(sheet).toContainElement(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
