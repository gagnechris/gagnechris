import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { IconButton } from './IconButton.js';
import { Toolbar, ToolbarSeparator } from './Toolbar.js';

const Harness = () => (
  <>
    <button type="button">Before</button>
    <Toolbar label="Formatting">
      <IconButton label="Bold">B</IconButton>
      <IconButton label="Italic">I</IconButton>
      <ToolbarSeparator />
      <IconButton label="Strike" disabled>
        S
      </IconButton>
      <IconButton label="Link">L</IconButton>
    </Toolbar>
    <button type="button">After</button>
  </>
);

describe('Toolbar', () => {
  test('one tab stop; arrows move and wrap, Home and End jump, disabled skipped', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.getByRole('toolbar', { name: 'Formatting' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    const bold = screen.getByRole('button', { name: 'Bold' });
    const italic = screen.getByRole('button', { name: 'Italic' });
    const link = screen.getByRole('button', { name: 'Link' });

    screen.getByRole('button', { name: 'After' }).focus();
    await user.tab({ shift: true });
    expect(bold).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(bold).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(italic).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(link).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(bold).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(link).toHaveFocus();
    await user.keyboard('{Home}');
    expect(bold).toHaveFocus();
    await user.keyboard('{End}');
    expect(link).toHaveFocus();

    await user.tab();
    await user.tab({ shift: true });
    expect(link).toHaveFocus();
  });
});
